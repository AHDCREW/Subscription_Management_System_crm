import type { BillingPeriod } from "@prisma/client";
import { PERIOD_LABEL } from "@/lib/subscriptions/templates";
import { formatDay } from "@/lib/subscriptions/subscriptions";

// Client-safe plan labels (no zod / server code), used by lists, badges and forms.

export const PLANS_PAGE_SIZE = 25;

export const BILLING_PERIODS = (Object.keys(PERIOD_LABEL) as BillingPeriod[]).map((value) => ({
  value,
  label: PERIOD_LABEL[value],
}));

export function isBillingPeriod(value: unknown): value is BillingPeriod {
  return typeof value === "string" && value in PERIOD_LABEL;
}

export type PlanFlag = "autoClose" | "closable" | "pausable" | "renewable";

// The per-plan options from the brief, each with a one-line explanation for the form.
export const PLAN_FLAGS: { key: PlanFlag; label: string; help: string }[] = [
  { key: "autoClose", label: "Auto-close", help: "Subscriptions close by themselves once their expiry date has passed." },
  { key: "closable", label: "Closable", help: "A running subscription can be closed early, before its expiry date." },
  { key: "pausable", label: "Pausable", help: "A running subscription can be paused and resumed later." },
  { key: "renewable", label: "Renewable", help: "A subscription can be renewed for another term when it ends." },
];

type Day = Date | string | null | undefined;

// "Always", "From 01 Nov 2026", "Until 31 Dec 2026" or "01 Nov 2026 – 31 Dec 2026".
export function availabilityLabel(startDate: Day, endDate: Day): string {
  if (startDate && endDate) return `${formatDay(startDate)} – ${formatDay(endDate)}`;
  if (startDate) return `From ${formatDay(startDate)}`;
  if (endDate) return `Until ${formatDay(endDate)}`;
  return "Always";
}
