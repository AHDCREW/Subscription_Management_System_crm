import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { outstandingAmount } from "@/lib/billing/invoice";
import { paymentBlockedReason } from "@/lib/billing/payment";
import { ButtonLink } from "@/components/kit";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Pay invoice" };

export default async function PayInvoicePage({ params }: PageProps<"/portal/invoices/[id]/pay">) {
  const user = await requireCustomer();
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [invoice, company] = await Promise.all([
    db.invoice.findFirst({
      where: { id, customerId: user.id, status: { not: "DRAFT" } },
      select: { id: true, number: true, status: true, total: true, amountPaid: true },
    }),
    db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } }),
  ]);
  if (!invoice) notFound();
  // Paid, cancelled or nothing left to pay: back to the invoice.
  if (paymentBlockedReason(invoice)) redirect(`/portal/invoices/${invoice.id}`);

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-4">
        <ButtonLink href={`/portal/invoices/${invoice.id}`} variant="ghost">
          <ArrowLeft className="size-4" aria-hidden /> Back to invoice
        </ButtonLink>
      </div>
      <CheckoutForm
        invoiceId={invoice.id}
        invoiceNumber={invoice.number}
        companyName={company?.name ?? "ROOT"}
        amount={outstandingAmount(invoice.total, invoice.amountPaid)}
        customerName={user.name}
      />
    </div>
  );
}
