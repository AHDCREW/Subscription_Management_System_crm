import type { PaymentMethod } from "@prisma/client";

// Pure display helpers for the dashboard and reports. No database access.

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  UPI: "UPI",
  CHEQUE: "Cheque",
  DEMO_PAY: "Demo Pay",
};

export const PAYMENT_METHODS = Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `dueDate` to `today` (both compared as UTC dates). */
export function daysOverdue(dueDate: Date, today: Date): number {
  const due = Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate());
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.max(0, Math.round((now - due) / DAY_MS));
}

/** The symbol for a currency code, e.g. "₹" for INR. */
export function currencySymbol(currency: string): string {
  const parts = new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? "";
}

/** Short money for chart labels: ₹1.2L, ₹45K. */
export function formatMoneyCompact(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** First day (UTC) of the month `offset` months from the month containing `date`. */
export function monthStart(date: Date, offset = 0): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
}

/** `YYYY-MM` key for a month (UTC). */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "Oct" / "Oct 2026" for a month start (UTC). */
export function monthLabel(date: Date, withYear = false): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    ...(withYear && { year: "numeric" }),
    timeZone: "UTC",
  }).format(date);
}

/** "1 day" / "12 days". */
export function pluralDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}
