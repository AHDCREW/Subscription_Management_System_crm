import type { BillingPeriod } from "@prisma/client";
import { round2, toNumber } from "@/lib/money";

// Pure pricing helpers for quotation templates. No database access, so the
// template form can import them for its live estimate as well.

type Numeric = Parameters<typeof toNumber>[0];

export const PERIOD_LABEL: Record<BillingPeriod, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const PERIOD_UNIT: Record<BillingPeriod, string> = {
  DAILY: "day",
  WEEKLY: "week",
  MONTHLY: "month",
  YEARLY: "year",
};

export type EstimateLine = { quantity: number; salesPrice: Numeric; extraPrice?: Numeric };

// Unit price of a line: the product's sales price plus the variant's extra price.
export function lineUnitPrice(salesPrice: Numeric, extraPrice?: Numeric): number {
  return round2(toNumber(salesPrice) + toNumber(extraPrice));
}

export function lineAmount(line: EstimateLine): number {
  return round2(line.quantity * lineUnitPrice(line.salesPrice, line.extraPrice));
}

// Estimated recurring total per billing period, tax exclusive:
// the plan price as a base fee plus every product line.
export function estimateRecurringTotal(planPrice: Numeric, lines: EstimateLine[]): number {
  return round2(lines.reduce((sum, line) => sum + lineAmount(line), toNumber(planPrice)));
}
