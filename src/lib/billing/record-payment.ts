// Records a payment against an invoice: manual ones from the team, and
// Demo Pay checkouts from the customer portal.
//
// Server-side only (it talks to MySQL through Prisma). Like run.ts it has no
// `import "server-only"` so scripts can call it; it is never imported from a
// client component.
//
// Everything happens in one transaction: re-read the invoice, check its status
// and balance, move amountPaid (and the status to PAID once the total is
// covered), then create the Payment. The update only matches while amountPaid
// is still the value we read, so two people recording at the same moment can't
// both spend the same balance.

import { Prisma } from "@prisma/client";
import { db } from "../db";
import { outstandingAmount } from "./invoice";
import {
  applyPayment,
  localIsoDate,
  parseIsoDate,
  paymentBlockedReason,
  PAYMENT_NOTE_MAX,
  toPaise,
  validatePayment,
  type PaymentFieldErrors,
  type PaymentInput,
  type PaymentMethodValue,
} from "./payment";

export type RecordPaymentResult =
  | { ok: true; paymentId: number; invoiceNumber: string; status: "CONFIRMED" | "PAID" }
  | { ok: false; error?: string; fieldErrors?: PaymentFieldErrors };

class PaymentConflict extends Error {}

const CONFLICT_MESSAGE = "This invoice changed while you were recording the payment. Check the balance and try again.";

type Tx = Prisma.TransactionClient;
type PaymentData = {
  method: PaymentMethodValue;
  amount: number;
  paymentDate: Date;
  note: string | null;
  reference?: string;
  recordedById: number;
};

// The guarded write both paths share: amountPaid only moves while it still
// holds the value we read, and only on a CONFIRMED invoice.
async function savePayment(
  tx: Tx,
  invoice: { id: number; total: Prisma.Decimal; amountPaid: Prisma.Decimal },
  data: PaymentData,
) {
  const next = applyPayment(invoice, data.amount);
  const { count } = await tx.invoice.updateMany({
    where: { id: invoice.id, status: "CONFIRMED", amountPaid: invoice.amountPaid },
    data: { amountPaid: next.amountPaid, status: next.status },
  });
  if (count !== 1) throw new PaymentConflict();

  const payment = await tx.payment.create({ data: { invoiceId: invoice.id, ...data }, select: { id: true } });
  return { paymentId: payment.id, status: next.status === "PAID" ? ("PAID" as const) : ("CONFIRMED" as const) };
}

const invoiceSelect = { id: true, number: true, status: true, total: true, amountPaid: true } as const;

export async function recordPayment(
  invoiceId: number,
  input: PaymentInput,
  recordedById: number,
  today: string = localIsoDate(),
): Promise<RecordPaymentResult> {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { ok: false, error: "Invoice not found." };

  try {
    return await db.$transaction(async (tx): Promise<RecordPaymentResult> => {
      const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, select: invoiceSelect });
      if (!invoice) return { ok: false, error: "Invoice not found." };

      const blocked = paymentBlockedReason(invoice);
      if (blocked) return { ok: false, error: blocked };

      const checked = validatePayment(input, { balance: outstandingAmount(invoice.total, invoice.amountPaid), today });
      if (!checked.ok) return { ok: false, fieldErrors: checked.fieldErrors };

      const saved = await savePayment(tx, invoice, { ...checked.value, recordedById });
      return { ok: true, paymentId: saved.paymentId, invoiceNumber: invoice.number, status: saved.status };
    });
  } catch (error) {
    if (error instanceof PaymentConflict) return { ok: false, error: CONFLICT_MESSAGE };
    throw error;
  }
}

export type DemoPaymentResult =
  | { ok: true; paymentId: number; reference: string; amount: number }
  | { ok: false; error: string };

/**
 * Records an approved Demo Pay checkout: the customer's own invoice, paid in
 * full (amount = the balance read inside the transaction). The gateway
 * reference is unique in the database, so the same attempt can't land twice.
 */
export async function recordDemoPayment(
  invoiceId: number,
  customerId: number,
  payment: { reference: string; note: string; expectedAmount?: number },
  today: string = localIsoDate(),
): Promise<DemoPaymentResult> {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { ok: false, error: "Invoice not found." };

  try {
    return await db.$transaction(async (tx): Promise<DemoPaymentResult> => {
      const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, customerId }, select: invoiceSelect });
      if (!invoice || invoice.status === "DRAFT") return { ok: false, error: "Invoice not found." };

      const blocked = paymentBlockedReason(invoice);
      if (blocked) return { ok: false, error: blocked };

      const amount = outstandingAmount(invoice.total, invoice.amountPaid);
      // Never charge a different amount from the one the customer saw on the checkout.
      if (payment.expectedAmount !== undefined && toPaise(payment.expectedAmount) !== toPaise(amount)) {
        return { ok: false, error: "The balance on this invoice changed. Reload the page to see the new amount." };
      }
      const saved = await savePayment(tx, invoice, {
        method: "DEMO_PAY",
        amount,
        paymentDate: parseIsoDate(today) ?? new Date(),
        note: payment.note.slice(0, PAYMENT_NOTE_MAX),
        reference: payment.reference,
        recordedById: customerId,
      });
      return { ok: true, paymentId: saved.paymentId, reference: payment.reference, amount };
    });
  } catch (error) {
    if (error instanceof PaymentConflict) return { ok: false, error: CONFLICT_MESSAGE };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "This payment was already recorded." };
    }
    throw error;
  }
}
