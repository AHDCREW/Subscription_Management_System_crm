import type { SubscriptionStatus } from "@prisma/client";
import type { BadgeTone } from "@/components/kit";
import { round2, toNumber } from "@/lib/money";

// Pure subscription helpers: status display, numbering, dates and totals.
// No database access, so client components can import them too.

type Numeric = Parameters<typeof toNumber>[0];

export const STATUS_INFO: Record<SubscriptionStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  QUOTATION: { label: "Quotation", tone: "blue" },
  CONFIRMED: { label: "Confirmed", tone: "indigo" },
  ACTIVE: { label: "Active", tone: "green" },
  PAUSED: { label: "Paused", tone: "amber" },
  CLOSED: { label: "Closed", tone: "gray" },
};

export const SUBSCRIPTION_STATUSES = Object.keys(STATUS_INFO) as SubscriptionStatus[];

export function isSubscriptionStatus(value: string): value is SubscriptionStatus {
  return value in STATUS_INFO;
}

// The main path through the life of a subscription; Paused sits beside Active.
export const STATUS_STEPS: SubscriptionStatus[] = ["DRAFT", "QUOTATION", "CONFIRMED", "ACTIVE", "CLOSED"];

// Lines and fields can only change before the customer has confirmed.
export const EDITABLE_STATUSES: SubscriptionStatus[] = ["DRAFT", "QUOTATION"];

export function isEditableStatus(status: SubscriptionStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

export const SUBSCRIPTIONS_PAGE_SIZE = 25;

// SUB-00001, SUB-00002, … derived from the auto-increment id, so it is unique
// without a separate counter. Grows past five digits on its own.
export function subscriptionNumber(id: number): string {
  return `SUB-${String(id).padStart(5, "0")}`;
}

export const PAYMENT_TERM_PRESETS = [0, 7, 15, 30] as const;

export function paymentTermsLabel(days: number): string {
  return days === 0 ? "Immediate" : `${days} day${days === 1 ? "" : "s"}`;
}

// ─── Dates ──────────────────────────────────────────────────────────────────
// Subscription dates are calendar dates stored as midnight UTC, matching the
// billing engine's date-only semantics.

const DATE_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse a `YYYY-MM-DD` input value to midnight UTC; null when invalid. */
export function parseDateInput(value: string): Date | null {
  const match = DATE_INPUT.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])];
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}

/** `YYYY-MM-DD` for a stored (midnight UTC) date. */
export function toDateInput(date: Date | null | undefined): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

/** Today's calendar date, as the business sees it (server local time), at midnight UTC. */
export function todayUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** Format a stored calendar date without shifting it into the viewer's time zone. */
export function formatDay(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(value),
  );
}

/** A plan can be sold on `date` when it is active and the date falls inside its own start/end dates. */
export function isPlanAvailableOn(
  plan: { active: boolean; startDate: Date | string | null; endDate: Date | string | null },
  date: Date,
): boolean {
  if (!plan.active) return false;
  const day = date.getTime();
  if (plan.startDate && day < startOfUtcDay(plan.startDate)) return false;
  if (plan.endDate && day > startOfUtcDay(plan.endDate)) return false;
  return true;
}

function startOfUtcDay(value: Date | string): number {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// ─── Totals ─────────────────────────────────────────────────────────────────
// Prices are tax exclusive. The plan price is a base-fee line (no tax) on top
// of the product lines; each product line carries at most one tax.

export type TotalsLine = { quantity: number; unitPrice: Numeric; taxRate?: Numeric };

export type SubscriptionTotals = {
  baseFee: number;
  productsSubtotal: number;
  subtotal: number;
  tax: number;
  total: number;
};

export function lineSubtotal(line: TotalsLine): number {
  return round2(line.quantity * toNumber(line.unitPrice));
}

export function lineTaxAmount(line: TotalsLine): number {
  return round2((lineSubtotal(line) * toNumber(line.taxRate)) / 100);
}

/** Recurring amounts for one billing period, before discounts. */
export function subscriptionTotals(planPrice: Numeric, lines: TotalsLine[]): SubscriptionTotals {
  const cents = (value: number) => Math.round(value * 100);
  const baseFee = round2(toNumber(planPrice));
  const productsSubtotal = lines.reduce((sum, line) => sum + cents(lineSubtotal(line)), 0) / 100;
  const tax = lines.reduce((sum, line) => sum + cents(lineTaxAmount(line)), 0) / 100;
  const subtotal = (cents(baseFee) + cents(productsSubtotal)) / 100;
  return { baseFee, productsSubtotal, subtotal, tax, total: (cents(subtotal) + cents(tax)) / 100 };
}
