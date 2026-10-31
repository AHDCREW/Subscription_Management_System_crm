"use server";

import { revalidatePath } from "next/cache";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  QUOTATION_VALIDITY_DAYS,
  STATUS_INFO,
  addDays,
  canClose,
  formatDay,
  isQuotationExpired,
  todayUtc,
} from "@/lib/subscriptions/subscriptions";

// Status changes made by the team from the subscription detail page.
// Confirmed → Active is done by the billing run, not here.

export type StatusActionResult = { ok: true; message: string } | { ok: false; error: string };

const current = {
  number: true,
  status: true,
  startDate: true,
  nextInvoiceDate: true,
  quotationExpiresAt: true,
  plan: { select: { closable: true } },
} as const;

type Current = Prisma.SubscriptionGetPayload<{ select: typeof current }>;

type Step = {
  from: SubscriptionStatus[];
  // Extra rule on top of the status check; return an error to refuse.
  check?: (sub: Current) => string | null;
  data: (sub: Current) => Prisma.SubscriptionUpdateManyMutationInput;
  message: (number: string) => string;
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
} satisfies Record<string, Step>;

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
    const { count } = await tx.subscription.updateMany({ where: { id, status: sub.status }, data: step.data(sub) });
    if (count === 0) return { ok: false, error: `${sub.number} was just changed by someone else. Reload and try again.` };
    return { ok: true, message: step.message(sub.number) };
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
