import { toNumber } from "../money";
import type { InvoiceStatusValue } from "./invoice";

// Pure payment helpers shared by the record-payment action and the payment pages.

type Numeric = Parameters<typeof toNumber>[0];

export type PaymentMethodValue = "CASH" | "BANK_TRANSFER" | "CARD" | "UPI" | "CHEQUE" | "DEMO_PAY";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  BANK_TRANSFER: "Bank transfer",
  CARD: "Card",
  UPI: "UPI",
  CHEQUE: "Cheque",
  DEMO_PAY: "Online (demo)",
};

/** Methods the team can record by hand. DEMO_PAY only comes from the customer checkout. */
export const MANUAL_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "UPI", "CHEQUE"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export const PAYMENT_NOTE_MAX = 255;

/** Money as whole paise, so comparisons never trip on floating point. */
export function toPaise(value: Numeric): number {
  return Math.round(toNumber(value) * 100);
}

/** Why an invoice can't take a payment, or null when it can. */
export function paymentBlockedReason(invoice: { status: InvoiceStatusValue; total: Numeric; amountPaid: Numeric }): string | null {
  switch (invoice.status) {
    case "DRAFT":
      return "This invoice is still a draft. Confirm it before recording a payment.";
    case "CANCELLED":
      return "This invoice was cancelled, so it can't take payments.";
    case "PAID":
      return "This invoice is fully paid.";
  }
  if (toPaise(invoice.total) - toPaise(invoice.amountPaid) <= 0) return "Nothing is left to pay on this invoice.";
  return null;
}

/** New amount paid and status after a payment. The invoice becomes PAID once the total is covered. */
export function applyPayment(invoice: { total: Numeric; amountPaid: Numeric }, amount: Numeric) {
  const paidPaise = toPaise(invoice.amountPaid) + toPaise(amount);
  return {
    amountPaid: paidPaise / 100,
    status: (paidPaise >= toPaise(invoice.total) ? "PAID" : "CONFIRMED") as InvoiceStatusValue,
  };
}

/** Share of the total that has been paid, 0–100. */
export function paidPercent(total: Numeric, amountPaid: Numeric): number {
  const totalPaise = toPaise(total);
  if (totalPaise <= 0) return 0;
  return Math.min(100, Math.max(0, (toPaise(amountPaid) / totalPaise) * 100));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A yyyy-mm-dd string as midnight UTC, or null when it isn't a real calendar date. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** A local calendar date as yyyy-mm-dd (what an <input type="date"> shows as "today"). */
export function localIsoDate(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type PaymentInput = { method: string; amount: string; date: string; note: string };
export type PaymentFieldErrors = Partial<Record<keyof PaymentInput, string>>;
export type ValidPayment = { method: ManualPaymentMethod; amount: number; paymentDate: Date; note: string | null };

const AMOUNT = /^\d+(\.\d{1,2})?$/;

/**
 * Checks a payment form against the invoice's balance.
 * `today` is the yyyy-mm-dd calendar date the payment may not be after.
 */
export function validatePayment(
  input: PaymentInput,
  ctx: { balance: Numeric; today: string },
): { ok: true; value: ValidPayment } | { ok: false; fieldErrors: PaymentFieldErrors } {
  const errors: PaymentFieldErrors = {};

  const method = input.method.trim();
  if (!(MANUAL_PAYMENT_METHODS as readonly string[]).includes(method)) errors.method = "Choose a payment method.";

  const rawAmount = input.amount.trim().replace(/,/g, "");
  const balancePaise = toPaise(ctx.balance);
  let amount = 0;
  if (!rawAmount) errors.amount = "Enter the amount received.";
  else if (!AMOUNT.test(rawAmount)) errors.amount = "Enter an amount with at most 2 decimals.";
  else {
    amount = toPaise(rawAmount) / 100;
    if (toPaise(rawAmount) <= 0) errors.amount = "Amount must be more than zero.";
    else if (toPaise(rawAmount) > balancePaise) errors.amount = `Amount can't be more than the balance due (${(balancePaise / 100).toFixed(2)}).`;
  }

  const paymentDate = parseIsoDate(input.date);
  if (!input.date.trim()) errors.date = "Enter the payment date.";
  else if (!paymentDate) errors.date = "Enter a valid date.";
  else if (input.date.trim() > ctx.today) errors.date = "Payment date can't be in the future.";

  const note = input.note.trim();
  if (note.length > PAYMENT_NOTE_MAX) errors.note = `Keep the note to ${PAYMENT_NOTE_MAX} characters or fewer.`;

  if (Object.keys(errors).length > 0 || !paymentDate) return { ok: false, fieldErrors: errors };
  return { ok: true, value: { method: method as ManualPaymentMethod, amount, paymentDate, note: note || null } };
}
