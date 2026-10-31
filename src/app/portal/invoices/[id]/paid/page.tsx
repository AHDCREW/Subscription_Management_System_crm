import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney } from "@/lib/money";
import { DEMO_REFERENCE } from "@/lib/billing/demo-pay";
import { ButtonLink, Card, DetailItem } from "@/components/kit";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Payment successful" };

export default async function InvoicePaidPage({ params, searchParams }: PageProps<"/portal/invoices/[id]/paid">) {
  const user = await requireCustomer();
  const id = Number((await params).id);
  const ref = (await searchParams).ref;
  if (!Number.isSafeInteger(id) || id <= 0 || typeof ref !== "string" || !DEMO_REFERENCE.test(ref)) notFound();

  // Only a Demo Pay receipt for this customer's own invoice.
  const payment = await db.payment.findFirst({
    where: { reference: ref, invoiceId: id, method: "DEMO_PAY", invoice: { customerId: user.id } },
    select: {
      amount: true,
      paymentDate: true,
      createdAt: true,
      note: true,
      reference: true,
      invoice: { select: { id: true, number: true, status: true } },
    },
  });
  if (!payment) notFound();

  return (
    <div className="mx-auto max-w-md">
      <Card className="text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success animate-in zoom-in-75 fade-in duration-500">
          <CheckCircle2 className="size-6" aria-hidden />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">Payment successful</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Invoice {payment.invoice.number} is {payment.invoice.status === "PAID" ? "now paid" : "updated"}.
        </p>
        <p className="mt-4 text-2xl font-semibold tabular-nums">{formatMoney(payment.amount)}</p>

        <dl className="mt-6 grid grid-cols-2 gap-4 border-t pt-6 text-left">
          <DetailItem label="Reference">
            <span className="font-mono text-xs">{payment.reference}</span>
          </DetailItem>
          <DetailItem label="Date">{formatDate(payment.paymentDate)}</DetailItem>
          <DetailItem label="Invoice">{payment.invoice.number}</DetailItem>
          <DetailItem label="Paid with">{payment.note?.replace(/^Paid online \(Demo Pay, (.*)\)$/, "$1") ?? "Demo Pay"}</DetailItem>
        </dl>

        <div className="no-print mt-6 flex flex-wrap justify-center gap-2">
          <ButtonLink href={`/portal/invoices/${payment.invoice.id}`}>Back to invoice</ButtonLink>
          <PrintButton variant="secondary">Print receipt</PrintButton>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Demo mode — no real money moved.</p>
      </Card>
    </div>
  );
}
