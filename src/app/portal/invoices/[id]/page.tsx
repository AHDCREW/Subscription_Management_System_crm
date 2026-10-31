import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, CreditCard } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { Button, ButtonLink } from "@/components/kit";
import { InvoiceDocument, invoiceDocumentInclude } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

async function getInvoiceId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return id;
}

// Only the signed-in customer's own invoices, and never drafts (drafts are internal).
function ownInvoiceWhere(id: number, customerId: number) {
  return { id, customerId, status: { not: "DRAFT" as const } };
}

export async function generateMetadata({ params }: PageProps<"/portal/invoices/[id]">): Promise<Metadata> {
  const user = await requireCustomer();
  const id = await getInvoiceId(params);
  const invoice = await db.invoice.findFirst({ where: ownInvoiceWhere(id, user.id), select: { number: true } });
  return { title: invoice ? `Invoice ${invoice.number}` : "Invoice" };
}

export default async function PortalInvoicePage({ params }: PageProps<"/portal/invoices/[id]">) {
  const user = await requireCustomer();
  const id = await getInvoiceId(params);

  const [invoice, company] = await Promise.all([
    db.invoice.findFirst({ where: ownInvoiceWhere(id, user.id), include: invoiceDocumentInclude }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <ButtonLink href="/portal/invoices" variant="ghost">
          <ArrowLeft className="size-4" aria-hidden /> All invoices
        </ButtonLink>
        <div className="flex flex-wrap items-center gap-2">
          {invoice.status === "CONFIRMED" && (
            <Button type="button" variant="secondary" disabled>
              <CreditCard className="size-4" aria-hidden /> Pay online — coming soon
            </Button>
          )}
          <PrintButton>Print / Save as PDF</PrintButton>
        </div>
      </div>

      <InvoiceDocument invoice={invoice} company={company} />
    </div>
  );
}
