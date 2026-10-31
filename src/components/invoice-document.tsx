import type { CompanySettings, InvoiceStatus, Prisma } from "@prisma/client";
import { formatDate, formatMoney, round2, toNumber } from "@/lib/money";
import { isInvoiceOverdue, lastDayOfPeriod, outstandingAmount, paymentTermsLabel } from "@/lib/billing";

// The printable invoice: a clean A4 document used by the staff print page and the customer portal.

/** What to load with an invoice to render it as a document. */
export const invoiceDocumentInclude = {
  customer: { select: { name: true, email: true, company: true, address: true } },
  subscription: { select: { number: true, paymentTermDays: true, plan: { select: { name: true } } } },
  lines: { orderBy: { id: "asc" } },
} satisfies Prisma.InvoiceInclude;

export type InvoiceDocumentData = Prisma.InvoiceGetPayload<{ include: typeof invoiceDocumentInclude }>;

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: "Draft",
  CONFIRMED: "Confirmed",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRate(rate: number) {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`;
}

export function InvoiceDocument({
  invoice,
  company,
}: {
  invoice: InvoiceDocumentData;
  company: CompanySettings | null;
}) {
  const currency = company?.currency ?? "INR";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  // A cancelled invoice is not owed.
  const balance = invoice.status === "CANCELLED" ? 0 : outstandingAmount(invoice.total, invoice.amountPaid);
  const overdue = isInvoiceOverdue(invoice);
  const termDays =
    invoice.subscription?.paymentTermDays ??
    Math.max(0, Math.round((invoice.dueDate.getTime() - invoice.invoiceDate.getTime()) / DAY_MS));
  const discountTotal = toNumber(invoice.discountTotal);

  return (
    <>
      {/* Paper settings: A4, white page, no app background or shadows. */}
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          html, body { background: #fff !important; }
          main { padding: 0 !important; overflow: visible !important; }
        }
      `}</style>

      <article className="rounded-xl border bg-card p-10 text-sm text-card-foreground sm:p-12 print:rounded-none print:border-0 print:bg-transparent print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-8">
          <div className="max-w-xs">
            <p className="text-lg font-semibold tracking-tight">{company?.name ?? "—"}</p>
            <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {company?.address && <p className="whitespace-pre-line">{company.address}</p>}
              {company?.email && <p>{company.email}</p>}
              {company?.phone && <p>{company.phone}</p>}
              {company?.gstNumber && <p>GSTIN {company.gstNumber}</p>}
            </div>
          </div>
          <div className="text-right">
            <h1 className="text-3xl font-semibold tracking-tight">Invoice</h1>
            <p className="mt-1 font-medium tabular-nums">{invoice.number}</p>
            <p
              className={
                overdue
                  ? "mt-2 inline-block rounded-md border border-destructive/40 px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-destructive"
                  : "mt-2 inline-block rounded-md border px-2 py-0.5 text-xs font-medium uppercase tracking-wider text-muted-foreground"
              }
            >
              {STATUS_LABEL[invoice.status]}
              {overdue && " · Overdue"}
            </p>
          </div>
        </header>

        <div className="mt-10 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill to</p>
            <p className="mt-2 font-medium">{invoice.customer.name}</p>
            <div className="mt-1 space-y-0.5 text-muted-foreground">
              {invoice.customer.company && <p>{invoice.customer.company}</p>}
              {invoice.customer.address && <p className="whitespace-pre-line">{invoice.customer.address}</p>}
              <p>{invoice.customer.email}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:justify-self-end print:justify-self-end">
            <div>
              <dt className="text-xs text-muted-foreground">Invoice date</dt>
              <dd className="mt-0.5 font-medium tabular-nums">{formatDate(invoice.invoiceDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Due date</dt>
              <dd className={overdue ? "mt-0.5 font-medium tabular-nums text-destructive" : "mt-0.5 font-medium tabular-nums"}>
                {formatDate(invoice.dueDate)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Billing period</dt>
              <dd className="mt-0.5 font-medium tabular-nums">
                {invoice.periodStart && invoice.periodEnd
                  ? `${formatDate(invoice.periodStart)} – ${formatDate(lastDayOfPeriod(invoice.periodEnd))}`
                  : "—"}
              </dd>
            </div>
            {invoice.subscription && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Subscription</dt>
                <dd className="mt-0.5 font-medium">
                  {invoice.subscription.number} · {invoice.subscription.plan.name}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div className="mt-10 overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-foreground/80 text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Description</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-right font-medium">Unit price</th>
                <th className="px-3 py-2 text-right font-medium">Discount</th>
                <th className="px-3 py-2 text-right font-medium">Tax %</th>
                <th className="py-2 pl-3 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.length === 0 ? (
                <tr className="border-b">
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    This invoice has no lines.
                  </td>
                </tr>
              ) : (
                invoice.lines.map((line) => {
                  const discount = toNumber(line.discountAmount);
                  const lineTotal = round2(toNumber(line.amount) - discount + toNumber(line.taxAmount));
                  return (
                    <tr key={line.id} className="border-b align-top break-inside-avoid">
                      <td className="py-3 pr-3">{line.description}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{line.quantity}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{money(line.unitPrice)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{discount > 0 ? `− ${money(discount)}` : "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{formatRate(toNumber(line.taxRate))}</td>
                      <td className="py-3 pl-3 text-right font-medium tabular-nums">{money(lineTotal)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Amount = quantity × unit price − discount + tax.</p>

        <div className="mt-6 flex justify-end break-inside-avoid">
          <dl className="w-full max-w-xs space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="tabular-nums">{discountTotal > 0 ? `− ${money(discountTotal)}` : money(0)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Tax</dt>
              <dd className="tabular-nums">{money(invoice.taxTotal)}</dd>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{money(invoice.total)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Paid</dt>
              <dd className="tabular-nums">{money(invoice.amountPaid)}</dd>
            </div>
            <div className="flex justify-between rounded-md bg-muted px-3 py-2 font-semibold print:bg-transparent print:px-0">
              <dt>Balance due</dt>
              <dd className={overdue ? "tabular-nums text-destructive" : "tabular-nums"}>{money(balance)}</dd>
            </div>
          </dl>
        </div>

        <div className="mt-10 grid gap-6 border-t pt-6 sm:grid-cols-2 print:grid-cols-2 break-inside-avoid">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Payment terms</p>
            <p className="mt-1">
              {paymentTermsLabel(termDays)} · due {formatDate(invoice.dueDate)}
            </p>
          </div>
          {invoice.notes && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
              <p className="mt-1 whitespace-pre-line">{invoice.notes}</p>
            </div>
          )}
        </div>

        <footer className="mt-12 text-center text-xs text-muted-foreground">
          Thank you for your business · Powered by SubFlow
        </footer>
      </article>
    </>
  );
}
