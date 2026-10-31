import { round2, toNumber } from "../money";
import type { DiscountRule } from "./discounts";
import { addPeriod, compareDates, toUtcDate } from "./period";

// Pure invoice helpers shared by the billing run and the invoice pages.

type Numeric = Parameters<typeof toNumber>[0];

export type InvoiceStatusValue = "DRAFT" | "CONFIRMED" | "PAID" | "CANCELLED";

/** Width of the numeric part of an invoice number: INV-00001. */
export const INVOICE_NUMBER_DIGITS = 5;

/** Invoice number from the company's invoice tag and the invoice id: INV-00042. */
export function formatInvoiceNumber(tag: string | null | undefined, id: number): string {
  const prefix = tag?.trim() || "INV";
  return `${prefix}-${String(id).padStart(INVOICE_NUMBER_DIGITS, "0")}`;
}

/** Due date = invoice date + payment terms (in days). */
export function dueDateFor(invoiceDate: Date, paymentTermDays: number): Date {
  return addPeriod(invoiceDate, "DAILY", Math.max(0, Math.trunc(paymentTermDays || 0)));
}

/**
 * Last day covered by a period whose stored end is exclusive ([start, end)),
 * e.g. a period ending 2026-11-01 covers up to 2026-10-31. For display only.
 */
export function lastDayOfPeriod(periodEnd: Date): Date {
  return addPeriod(periodEnd, "DAILY", -1);
}

/** Invoice line text: the subscription line's own description, else the product name plus variant. */
export function invoiceLineDescription(input: {
  description?: string | null;
  productName: string;
  variant?: { attribute: string; value: string } | null;
}): string {
  const own = input.description?.trim();
  if (own) return own.slice(0, 255);
  const variant = input.variant ? ` (${input.variant.attribute}: ${input.variant.value})` : "";
  return `${input.productName}${variant}`.slice(0, 255);
}

/** Amount still to be paid on an invoice (never negative). */
export function outstandingAmount(total: Numeric, amountPaid: Numeric): number {
  return round2(Math.max(0, toNumber(total) - toNumber(amountPaid)));
}

/** Overdue = confirmed, not fully paid, and the due date is before today. */
export function isInvoiceOverdue(
  invoice: { status: InvoiceStatusValue; dueDate: Date; total: Numeric; amountPaid: Numeric },
  today: Date = new Date(),
): boolean {
  return (
    invoice.status === "CONFIRMED" &&
    outstandingAmount(invoice.total, invoice.amountPaid) > 0 &&
    compareDates(invoice.dueDate, today) < 0
  );
}

/** The first moment of the next calendar day (UTC): "on or before today" means `< tomorrow`. */
export function startOfTomorrow(today: Date): Date {
  return addPeriod(toUtcDate(today), "DAILY");
}

/** A discount row from the database (Decimals allowed) as a plain DiscountRule. */
export function toDiscountRule(discount: {
  id: number;
  type: DiscountRule["type"];
  value: Numeric;
  scope: DiscountRule["scope"];
  minPurchase: Numeric;
  minQuantity: number | null;
  startDate: Date | null;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
  active: boolean;
  products: { productId: number }[];
}): DiscountRule {
  return {
    id: discount.id,
    type: discount.type,
    value: toNumber(discount.value),
    scope: discount.scope,
    productIds: discount.products.map((p) => p.productId),
    minPurchase: discount.minPurchase === null || discount.minPurchase === undefined ? null : toNumber(discount.minPurchase),
    minQuantity: discount.minQuantity,
    startDate: discount.startDate,
    endDate: discount.endDate,
    usageLimit: discount.usageLimit,
    usedCount: discount.usedCount,
    active: discount.active,
  };
}
