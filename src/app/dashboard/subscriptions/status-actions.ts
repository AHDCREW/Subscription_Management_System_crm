"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendQuotationEmail } from "@/lib/subscriptions/send-quotation-email";
import { isQuotationExpired, type RenewalTerm } from "@/lib/subscriptions/subscriptions";
import { STEPS, applyTransition, parseRenewStep, type Step, type TransitionResult } from "@/lib/subscriptions/transitions";

// Status changes made by the team from the subscription detail page. The
// guarded transition rules live in src/lib/subscriptions/transitions.ts and are
// shared with the customer portal.

// `warning` is set when the change went through but something after it (the email) did not.
export type StatusActionResult = TransitionResult & { warning?: string };

async function transition(id: number, step: Step): Promise<StatusActionResult> {
  await requireTeam();
  const result = await applyTransition(id, step);
  if (result.ok) {
    revalidatePath("/dashboard/subscriptions");
    revalidatePath(`/dashboard/subscriptions/${id}`);
  }
  return result;
}

// The email goes out after the status change is saved. A failed email never
// undoes the change: it is logged and reported as a warning instead.
export async function sendQuotation(id: number): Promise<StatusActionResult> {
  const result = await transition(id, STEPS.sendQuotation);
  if (!result.ok) return result;
  try {
    const to = await sendQuotationEmail(id);
    return to ? { ...result, message: `${result.message.replace(/\.$/, "")} to ${to}.` } : result;
  } catch (error) {
    console.error(`[quotation] email for subscription ${id} failed`, error);
    return { ...result, warning: "Quotation sent, but the email couldn't be delivered." };
  }
}

export async function resendQuotationEmail(id: number): Promise<StatusActionResult> {
  await requireTeam();
  const sub = await db.subscription.findUnique({
    where: { id: Number(id) || 0 },
    select: { number: true, status: true, quotationExpiresAt: true },
  });
  if (!sub) return { ok: false, error: "This subscription no longer exists." };
  if (sub.status !== "QUOTATION") return { ok: false, error: `${sub.number} is no longer a quotation. Reload to see its latest status.` };
  if (isQuotationExpired(sub.quotationExpiresAt)) {
    return { ok: false, error: "This quotation has expired. Move it back to draft and send a new one." };
  }
  try {
    const to = await sendQuotationEmail(id);
    if (!to) return { ok: false, error: "This subscription no longer exists." };
    return { ok: true, message: `Quotation ${sub.number} emailed again to ${to}.` };
  } catch (error) {
    console.error(`[quotation] resend for subscription ${id} failed`, error);
    return { ok: false, error: "The email couldn't be delivered. Try again in a moment." };
  }
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
  const renew = parseRenewStep(expectedExpiry, term);
  if (!renew.ok) return renew;
  return transition(id, renew.step);
}
