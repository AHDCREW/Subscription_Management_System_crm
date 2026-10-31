"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireCustomer } from "@/lib/auth";
import { demoPaymentNote, newDemoReference, simulateDemoGateway, type DemoPayFieldErrors, type DemoPayInput } from "@/lib/billing/demo-pay";
import { recordDemoPayment } from "@/lib/billing/record-payment";

export type DemoPayResult = { error?: string; declined?: boolean; fieldErrors?: DemoPayFieldErrors };

function text(value: unknown, max = 120): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

/**
 * Demo Pay checkout. The result is decided here from the test values (never
 * from anything the browser claims), then recorded through the same guarded
 * transaction as manual payments. On success it redirects to the receipt.
 */
export async function payInvoiceDemo(invoiceId: number, raw: DemoPayInput, expectedAmount: number): Promise<DemoPayResult> {
  const user = await requireCustomer();
  if (typeof invoiceId !== "number" || !Number.isSafeInteger(invoiceId) || invoiceId <= 0) return { error: "Invoice not found." };

  const input: DemoPayInput = {
    method: text(raw?.method, 10),
    cardNumber: text(raw?.cardNumber, 40),
    expiry: text(raw?.expiry, 10),
    cvc: text(raw?.cvc, 10),
    name: text(raw?.name),
    upiId: text(raw?.upiId),
  };

  const gateway = simulateDemoGateway(input);
  if (gateway.status === "invalid") return { fieldErrors: gateway.fieldErrors };
  if (gateway.status === "declined") return { error: gateway.message, declined: true };

  const reference = newDemoReference();
  const result = await recordDemoPayment(invoiceId, user.id, {
    reference,
    note: demoPaymentNote(gateway.label),
    expectedAmount: typeof expectedAmount === "number" && Number.isFinite(expectedAmount) ? expectedAmount : undefined,
  });
  if (!result.ok) return { error: result.error };

  revalidatePath("/portal", "layout");
  revalidatePath("/dashboard", "layout");
  redirect(`/portal/invoices/${invoiceId}/paid?ref=${encodeURIComponent(result.reference)}`);
}
