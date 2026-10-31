import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { ButtonLink } from "@/components/kit";
import { InvoiceDocument, invoiceDocumentInclude } from "@/components/invoice-document";
import { PrintButton } from "@/components/print-button";

async function getInvoiceId(params: Promise<{ id: string }>) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  return id;
}

export async function generateMetadata({ params }: PageProps<"/dashboard/invoices/[id]/print">): Promise<Metadata> {
  await requireTeam();
  const id = await getInvoiceId(params);
  const invoice = await db.invoice.findUnique({ where: { id }, select: { number: true } });
  return { title: invoice ? `Invoice ${invoice.number}` : "Invoice" };
}

export default async function InvoicePrintPage({ params }: PageProps<"/dashboard/invoices/[id]/print">) {
  await requireTeam();
  const id = await getInvoiceId(params);

  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: invoiceDocumentInclude }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!invoice) notFound();

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="no-print mb-4 flex items-center justify-between gap-3">
        <ButtonLink href={`/dashboard/invoices/${invoice.id}`} variant="ghost">
          <ArrowLeft className="size-4" aria-hidden /> Back
        </ButtonLink>
        <PrintButton />
      </div>

      <InvoiceDocument invoice={invoice} company={company} />
    </div>
  );
}
