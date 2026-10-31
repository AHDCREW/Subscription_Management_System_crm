"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import type { BillingRunSummary } from "@/lib/billing/run";
import { runAndRecordBilling } from "@/lib/jobs/billing-job";
import { recordPayment } from "@/lib/billing/record-payment";
import type { PaymentFieldErrors } from "@/lib/billing/payment";

export type RunBillingNowResult = BillingRunSummary | { inProgress: true; message: string };

/** "Run billing now": invoices everything due up to today. Safe to press twice; refused while another run is busy. */
export async function runBillingNow(): Promise<RunBillingNowResult> {
  const user = await requireTeam();
  const result = await runAndRecordBilling({ trigger: "MANUAL", userId: user.id });
  if (result.status !== "completed") return { inProgress: true, message: result.message };
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard/billing-runs");
  revalidatePath("/dashboard");
  return result.summary;
}

export type InvoiceActionResult = { ok: true; message: string } | { ok: false; error: string };

function validId(id: unknown): id is number {
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0;
}

function revalidateInvoice(id?: number) {
  revalidatePath("/dashboard/invoices");
  if (id) revalidatePath(`/dashboard/invoices/${id}`);
  revalidatePath("/dashboard");
}

/** Draft → Confirmed. The status guard makes a double click or a stale page a no-op. */
export async function confirmInvoice(id: number): Promise<InvoiceActionResult> {
  await requireTeam();
  if (!validId(id)) return { ok: false, error: "Invoice not found." };

  const { count } = await db.invoice.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "CONFIRMED" },
  });
  revalidateInvoice(id);

  if (count === 0) return { ok: false, error: "This invoice is no longer a draft, so it was not confirmed." };
  return { ok: true, message: "Invoice confirmed" };
}

/** Draft or Confirmed → Cancelled, only while no payment has been recorded against it. */
export async function cancelInvoice(id: number): Promise<InvoiceActionResult> {
  await requireTeam();
  if (!validId(id)) return { ok: false, error: "Invoice not found." };

  const { count } = await db.invoice.updateMany({
    where: { id, status: { in: ["DRAFT", "CONFIRMED"] }, amountPaid: 0, payments: { none: {} } },
    data: { status: "CANCELLED" },
  });
  revalidateInvoice(id);

  if (count === 1) return { ok: true, message: "Invoice cancelled" };

  const invoice = await db.invoice.findUnique({
    where: { id },
    select: { status: true, _count: { select: { payments: true } } },
  });
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (invoice.status === "CANCELLED") return { ok: false, error: "This invoice is already cancelled." };
  if (invoice.status === "PAID" || invoice._count.payments > 0) {
    return { ok: false, error: "This invoice has payments recorded, so it can't be cancelled." };
  }
  return { ok: false, error: "This invoice can't be cancelled." };
}

/** Confirms every draft invoice in one statement. Returns how many were confirmed. */
export async function confirmAllDrafts(): Promise<{ confirmed: number }> {
  await requireTeam();
  const { count } = await db.invoice.updateMany({
    where: { status: "DRAFT" },
    data: { status: "CONFIRMED" },
  });
  revalidateInvoice();
  return { confirmed: count };
}

export type RecordPaymentState =
  | { ok: true; message: string }
  | { ok: false; error?: string; fieldErrors?: PaymentFieldErrors }
  | undefined;

/** Records a manual payment (cash, bank transfer, card, UPI, cheque) against a confirmed invoice. */
export async function recordInvoicePayment(invoiceId: number, formData: FormData): Promise<RecordPaymentState> {
  const user = await requireTeam();
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };

  const result = await recordPayment(
    invoiceId,
    { method: text("method"), amount: text("amount"), date: text("date"), note: text("note") },
    user.id,
  );
  if (!result.ok) return result;

  revalidateInvoice(invoiceId);
  revalidatePath("/dashboard/payments");
  return {
    ok: true,
    message: result.status === "PAID" ? `Payment recorded. ${result.invoiceNumber} is now paid.` : "Payment recorded",
  };
}
