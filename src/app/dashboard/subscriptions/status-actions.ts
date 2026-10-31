"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import type { RenewalTerm } from "@/lib/subscriptions/subscriptions";
import { STEPS, applyTransition, parseRenewStep, type Step, type TransitionResult } from "@/lib/subscriptions/transitions";

// Status changes made by the team from the subscription detail page. The
// guarded transition rules live in src/lib/subscriptions/transitions.ts and are
// shared with the customer portal.

export type StatusActionResult = TransitionResult;

async function transition(id: number, step: Step): Promise<StatusActionResult> {
  await requireTeam();
  const result = await applyTransition(id, step);
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
  const renew = parseRenewStep(expectedExpiry, term);
  if (!renew.ok) return renew;
  return transition(id, renew.step);
}
