// Records a manual payment against an invoice.
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

import { db } from "../db";
import { outstandingAmount } from "./invoice";
import { applyPayment, localIsoDate, paymentBlockedReason, validatePayment, type PaymentFieldErrors, type PaymentInput } from "./payment";

export type RecordPaymentResult =
  | { ok: true; paymentId: number; invoiceNumber: string; status: "CONFIRMED" | "PAID" }
  | { ok: false; error?: string; fieldErrors?: PaymentFieldErrors };

class PaymentConflict extends Error {}

export async function recordPayment(
  invoiceId: number,
  input: PaymentInput,
  recordedById: number,
  today: string = localIsoDate(),
): Promise<RecordPaymentResult> {
  if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { ok: false, error: "Invoice not found." };

  try {
    return await db.$transaction(async (tx): Promise<RecordPaymentResult> => {
      const invoice = await tx.invoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, number: true, status: true, total: true, amountPaid: true },
      });
      if (!invoice) return { ok: false, error: "Invoice not found." };

      const blocked = paymentBlockedReason(invoice);
      if (blocked) return { ok: false, error: blocked };

      const checked = validatePayment(input, { balance: outstandingAmount(invoice.total, invoice.amountPaid), today });
      if (!checked.ok) return { ok: false, fieldErrors: checked.fieldErrors };

      const next = applyPayment(invoice, checked.value.amount);
      const { count } = await tx.invoice.updateMany({
        where: { id: invoice.id, status: "CONFIRMED", amountPaid: invoice.amountPaid },
        data: { amountPaid: next.amountPaid, status: next.status },
      });
      if (count !== 1) throw new PaymentConflict();

      const payment = await tx.payment.create({
        data: {
          invoiceId: invoice.id,
          method: checked.value.method,
          amount: checked.value.amount,
          paymentDate: checked.value.paymentDate,
          note: checked.value.note,
          recordedById,
        },
        select: { id: true },
      });

      return { ok: true, paymentId: payment.id, invoiceNumber: invoice.number, status: next.status === "PAID" ? "PAID" : "CONFIRMED" };
    });
  } catch (error) {
    if (error instanceof PaymentConflict) {
      return { ok: false, error: "This invoice changed while you were recording the payment. Check the balance and try again." };
    }
    throw error;
  }
}
