"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { z } from "zod";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  QUOTATION_VALIDITY_DAYS,
  STATUS_INFO,
  addDays,
  canClose,
  canPause,
  canRenew,
  formatDay,
  isQuotationExpired,
  parseDateInput,
  RENEWAL_TERM_LABEL,
  RENEWAL_TERMS,
  renewedExpiryDate,
  resumeNextInvoiceDate,
  toDateInput,
  todayUtc,
  type RenewalTerm,
} from "@/lib/subscriptions/subscriptions";

const renewInput = z.object({
  expectedExpiry: z.string().refine((value) => parseDateInput(value) !== null),
  term: z.enum(RENEWAL_TERMS),
});

// Status changes made by the team from the subscription detail page.
// Confirmed → Active is done by the billing run, not here.

export type StatusActionResult = { ok: true; message: string } | { ok: false; error: string };

const current = {
  number: true,
  status: true,
  startDate: true,
  expiryDate: true,
  nextInvoiceDate: true,
  quotationExpiresAt: true,
  plan: { select: { closable: true, pausable: true, renewable: true } },
} as const;

type Current = Prisma.SubscriptionGetPayload<{ select: typeof current }>;

type Step = {
  from: SubscriptionStatus[];
  // Extra rule on top of the status check; return an error to refuse.
  check?: (sub: Current) => string | null;
  data: (sub: Current) => Prisma.SubscriptionUpdateManyMutationInput;
  // Extra conditions for the guarded update, for changes that keep the status.
  guard?: (sub: Current) => Prisma.SubscriptionWhereInput;
  message: (number: string, sub: Current) => string;
};

const STEPS = {
  sendQuotation: {
    from: ["DRAFT"],
    data: (sub) => {
      const today = todayUtc();
      // Keep a template's validity; give a fresh one when missing or already past.
      const keep = sub.quotationExpiresAt && !isQuotationExpired(sub.quotationExpiresAt, today);
      return {
        status: "QUOTATION",
        quotationExpiresAt: keep ? sub.quotationExpiresAt : addDays(today, QUOTATION_VALIDITY_DAYS),
      };
    },
    message: (number) => `Quotation ${number} sent.`,
  },
  confirm: {
    from: ["QUOTATION"],
    check: (sub) =>
      isQuotationExpired(sub.quotationExpiresAt)
        ? `The quotation expired on ${formatDay(sub.quotationExpiresAt)}. Move it back to draft and send a new quotation.`
        : null,
    data: (sub) => ({
      status: "CONFIRMED",
      confirmedAt: new Date(),
      nextInvoiceDate: sub.nextInvoiceDate ?? sub.startDate,
    }),
    message: (number) => `${number} confirmed.`,
  },
  backToDraft: {
    from: ["QUOTATION"],
    data: () => ({ status: "DRAFT" }),
    message: (number) => `${number} moved back to draft.`,
  },
  close: {
    from: ["CONFIRMED", "ACTIVE", "PAUSED"],
    check: (sub) => (canClose(sub.status, sub.plan.closable) ? null : "This plan can't be closed early."),
    data: () => ({ status: "CLOSED", closedAt: new Date() }),
    message: (number) => `${number} closed.`,
  },
  pause: {
    from: ["ACTIVE"],
    check: (sub) => (canPause(sub.status, sub.plan.pausable) ? null : "This plan can't be paused."),
    data: () => ({ status: "PAUSED" }),
    message: (number) => `${number} paused. No invoices will be raised until it is resumed.`,
  },
  resume: {
    from: ["PAUSED"],
    // No back-billing: the billing run only picks up periods from the resume date on.
    data: (sub) => ({ status: "ACTIVE", nextInvoiceDate: resumeNextInvoiceDate(sub.nextInvoiceDate) }),
    message: (number, sub) => `${number} resumed. Next invoice on ${formatDay(resumeNextInvoiceDate(sub.nextInvoiceDate))}.`,
  },
} satisfies Record<string, Step>;

// Renewing keeps the status, so the update is also guarded on the expiry date
// the user saw: a double click or a stale page can't extend it twice.
// The new expiry is always worked out here from the stored expiry and the term.
function renewStep(expectedExpiry: string, term: RenewalTerm): Step {
  return {
    from: ["ACTIVE", "PAUSED"],
    check: (sub) => {
      if (!sub.plan.renewable) return "This plan can't be renewed.";
      if (!canRenew(sub.status, sub.plan.renewable, sub.expiryDate)) {
        return "This subscription has no expiry date, so there is nothing to renew.";
      }
      if (toDateInput(sub.expiryDate) !== expectedExpiry) {
        return `${sub.number} was just renewed or changed. Reload to see its latest expiry date.`;
      }
      return null;
    },
    guard: (sub) => ({ expiryDate: sub.expiryDate }),
    data: (sub) => ({ expiryDate: renewedExpiryDate(sub.expiryDate!, term) }),
    message: (number, sub) =>
      `${number} renewed for ${RENEWAL_TERM_LABEL[term]}, until ${formatDay(renewedExpiryDate(sub.expiryDate!, term))}.`,
  };
}

async function transition(rawId: number, step: Step): Promise<StatusActionResult> {
  await requireTeam();

  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "This subscription could not be found." };

  const result = await db.$transaction(async (tx): Promise<StatusActionResult> => {
    const sub = await tx.subscription.findUnique({ where: { id }, select: current });
    if (!sub) return { ok: false, error: "This subscription no longer exists." };
    if (!step.from.includes(sub.status)) {
      return {
        ok: false,
        error: `${sub.number} is already ${STATUS_INFO[sub.status].label.toLowerCase()}. Reload to see its latest status.`,
      };
    }
    const refused = step.check?.(sub);
    if (refused) return { ok: false, error: refused };

    // The status guard makes a double click or a stale page a no-op instead of
    // applying the change twice.
    const { count } = await tx.subscription.updateMany({
      where: { ...step.guard?.(sub), id, status: sub.status },
      data: step.data(sub),
    });
    if (count === 0) return { ok: false, error: `${sub.number} was just changed by someone else. Reload and try again.` };
    return { ok: true, message: step.message(sub.number, sub) };
  });

  if (result.ok) {
    revalidatePath("/dashboard/subscriptions");
    revalidatePath(`/dashboard/subscriptions/${id}`);
  }
  return result;
}

export async function sendQuotation(id: number) {
  return transition(id, STEPS.sendQuotation);
}

export async function confirmSubscription(id: number) {
  return transition(id, STEPS.confirm);
}

export async function backToDraft(id: number) {
  return transition(id, STEPS.backToDraft);
}

export async function closeSubscription(id: number) {
  return transition(id, STEPS.close);
}

export async function pauseSubscription(id: number) {
  return transition(id, STEPS.pause);
}

export async function resumeSubscription(id: number) {
  return transition(id, STEPS.resume);
}

/**
 * `expectedExpiry` is the `YYYY-MM-DD` expiry shown in the confirm dialog and
 * `term` the chosen renewal length; the new date itself is computed here.
 */
export async function renewSubscription(id: number, expectedExpiry: string, term: RenewalTerm): Promise<StatusActionResult> {
  await requireTeam();
  const parsed = renewInput.safeParse({ expectedExpiry, term });
  if (!parsed.success) {
    const badTerm = parsed.error.issues.some((issue) => issue.path[0] === "term");
    return {
      ok: false,
      error: badTerm
        ? "Choose a renewal length of 1, 3 or 6 months, or 1 year."
        : "The expiry date on this page is out of date. Reload and try again.",
    };
  }
  return transition(id, renewStep(parsed.data.expectedExpiry, parsed.data.term));
}
