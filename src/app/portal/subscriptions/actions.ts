"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { formatDay, resumeNextInvoiceDate } from "@/lib/subscriptions/subscriptions";
import { STEPS, applyTransition, parseRenewStep, type Step, type TransitionResult } from "@/lib/subscriptions/transitions";
import { customerSubscriptionsWhere } from "./data";

// Self-service changes a customer makes to their own subscriptions. Same
// guarded rules as the team's actions; only the wording is for the customer.

async function transition(id: number, step: Step): Promise<TransitionResult> {
  const user = await requireCustomer();
  // Scoped to the signed-in customer: another customer's id is "not found".
  const result = await applyTransition(id, step, customerSubscriptionsWhere(user.id));
  if (result.ok) {
    revalidatePath("/portal", "layout");
    revalidatePath("/dashboard/subscriptions");
    revalidatePath(`/dashboard/subscriptions/${id}`);
  }
  return result;
}

export async function pauseMySubscription(id: number) {
  return transition(id, {
    ...STEPS.pause,
    message: (number) => `${number} paused. You won't be billed until you resume it.`,
  });
}

export async function resumeMySubscription(id: number) {
  return transition(id, {
    ...STEPS.resume,
    message: (number, sub) =>
      `${number} resumed. Your next bill is on ${formatDay(resumeNextInvoiceDate(sub.nextInvoiceDate))}.`,
  });
}

export async function cancelMySubscription(id: number) {
  return transition(id, {
    ...STEPS.close,
    // A confirmed subscription that hasn't started is cancelled by the team, not the customer.
    from: ["ACTIVE", "PAUSED"],
    message: (number) => `${number} cancelled. No further invoices will be raised.`,
  });
}

/** `expectedExpiry` is the `YYYY-MM-DD` expiry the customer saw; the new date is computed on the server. */
export async function renewMySubscription(id: number, expectedExpiry: string, term: string): Promise<TransitionResult> {
  await requireCustomer();
  const renew = parseRenewStep(expectedExpiry, term);
  if (!renew.ok) return renew;
  return transition(id, renew.step);
}
