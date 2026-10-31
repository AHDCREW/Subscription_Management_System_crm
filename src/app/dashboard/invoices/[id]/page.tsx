import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, round2, toNumber } from "@/lib/money";
import {
  canCancelInvoice,
  canConfirmInvoice,
  isInvoiceOverdue,
  lastDayOfPeriod,
  outstandingAmount,
  paidPercent,
  paymentBlockedReason,
  PAYMENT_METHOD_LABELS,
} from "@/lib/billing";
import { Card, PageHeader, SectionHeader, Table, Td, Th } from "@/components/kit";
import { FadeIn } from "@/components/motion";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { InvoiceStatusBadge, OverdueBadge } from "../status";
import { InvoiceActions } from "./invoice-actions";

function formatRate(rate: number) {
  return `${Number.isInteger(rate) ? rate : rate.toFixed(2)}%`;
}

export default async function InvoiceDetailPage({ params }: PageProps<"/dashboard/invoices/[id]">) {
  await requireTeam();

  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();

  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true, email: true, company: true, phone: true, address: true } },
        subscription: { select: { number: true, plan: { select: { name: true, billingPeriod: true } } } },
        lines: { orderBy: { id: "asc" } },
        _count: { select: { payments: true } },
        payments: {
          orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
          include: { recordedBy: { select: { name: true } } },
        },
      },
    }),
    db.companySettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!invoice) notFound();

  const currency = company?.currency ?? "INR";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const overdue = isInvoiceOverdue(invoice);
  const balance = outstandingAmount(invoice.total, invoice.amountPaid);
  const paymentBlocked = paymentBlockedReason(invoice);
  const percentPaid = paidPercent(invoice.total, invoice.amountPaid);

  return (
    <>
      <Link
        href="/dashboard/invoices"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> All invoices
      </Link>
      <PageHeader
        title={invoice.number}
        description={
          invoice.subscription
            ? `Invoice for subscription ${invoice.subscription.number} · ${invoice.subscription.plan.name}`
            : "Invoice"
        }
        actions={
          <div className="flex items-center gap-1.5">
            <InvoiceStatusBadge status={invoice.status} />
            {overdue && <OverdueBadge />}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <FadeIn className="min-w-0 space-y-6">
          <Card>
            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">From</p>
                <p className="mt-2 font-medium">{company?.name ?? "—"}</p>
                <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {company?.address && <p className="whitespace-pre-line">{company.address}</p>}
                  {company?.email && <p>{company.email}</p>}
                  {company?.phone && <p>{company.phone}</p>}
                  {company?.gstNumber && <p>GSTIN {company.gstNumber}</p>}
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bill to</p>
                <p className="mt-2 font-medium">{invoice.customer.name}</p>
                <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                  {invoice.customer.company && <p>{invoice.customer.company}</p>}
                  {invoice.customer.address && <p className="whitespace-pre-line">{invoice.customer.address}</p>}
                  <p>{invoice.customer.email}</p>
                  {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
                </div>
              </div>
            </div>

            <Separator className="my-5" />

            <dl className="grid gap-4 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Invoice date</dt>
                <dd className="mt-0.5 font-medium">{formatDate(invoice.invoiceDate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due date</dt>
                <dd className={`mt-0.5 font-medium ${overdue ? "text-destructive" : ""}`}>{formatDate(invoice.dueDate)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Billing period</dt>
                <dd className="mt-0.5 font-medium">
                  {invoice.periodStart && invoice.periodEnd
                    ? `${formatDate(invoice.periodStart)} – ${formatDate(lastDayOfPeriod(invoice.periodEnd))}`
                    : "—"}
                </dd>
              </div>
            </dl>
          </Card>

          <Table>
            <thead>
              <tr>
                <Th>Description</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit price</Th>
                <Th className="text-right">Discount</Th>
                <Th className="text-right">Tax %</Th>
                <Th className="text-right">Tax</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.length === 0 ? (
                <tr>
                  <Td colSpan={7} className="py-8 text-center text-muted-foreground">
                    This invoice has no lines.
                  </Td>
                </tr>
              ) : (
                invoice.lines.map((line) => {
                  const discount = toNumber(line.discountAmount);
                  const lineTotal = round2(toNumber(line.amount) - discount + toNumber(line.taxAmount));
                  return (
                    <tr key={line.id} className="transition-colors hover:bg-muted/40">
                      <Td>
                        <div className="font-medium">{line.description}</div>
                        {line.productId === null && <div className="text-xs text-muted-foreground">Plan base fee</div>}
                      </Td>
                      <Td className="text-right tabular-nums">{line.quantity}</Td>
                      <Td className="text-right tabular-nums">{money(line.unitPrice)}</Td>
                      <Td className="text-right tabular-nums">
                        {discount > 0 ? `− ${money(discount)}` : <span className="text-muted-foreground">—</span>}
                      </Td>
                      <Td className="text-right tabular-nums">{formatRate(toNumber(line.taxRate))}</Td>
                      <Td className="text-right tabular-nums">{money(line.taxAmount)}</Td>
                      <Td className="text-right font-medium tabular-nums">{money(lineTotal)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
          <p className="-mt-4 text-xs text-muted-foreground">
            Prices exclude tax. Line amount = quantity × unit price − discount + tax.
          </p>

          <Card className="overflow-hidden p-0">
            <div className="p-6">
              <SectionHeader
                title="Payments"
                description={paymentBlocked && invoice.status !== "PAID" ? paymentBlocked : "Every payment received against this invoice."}
              />
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <p>
                  <span className="font-semibold tabular-nums">{money(invoice.amountPaid)}</span>
                  <span className="text-muted-foreground"> paid of {money(invoice.total)}</span>
                </p>
                <p className={invoice.status === "PAID" ? "font-medium text-success" : "text-muted-foreground"}>
                  {invoice.status === "PAID" ? (
                    "Paid in full"
                  ) : (
                    <>
                      Balance <span className={`font-medium tabular-nums ${overdue ? "text-destructive" : "text-foreground"}`}>{money(balance)}</span>
                    </>
                  )}
                </p>
              </div>
              <Progress
                value={percentPaid}
                aria-label={`${Math.round(percentPaid)}% paid`}
                className={`mt-3 h-1.5 ${invoice.status === "PAID" ? "*:data-[slot=progress-indicator]:bg-success" : ""}`}
              />
            </div>
            {invoice.payments.length === 0 ? (
              <p className="border-t px-6 py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-sm">
                  <thead>
                    <tr>
                      <Th>Date</Th>
                      <Th>Method</Th>
                      <Th className="text-right">Amount</Th>
                      <Th>Note</Th>
                      <Th>Recorded by</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.payments.map((payment) => (
                      <tr key={payment.id} className="transition-colors hover:bg-muted/40">
                        <Td className="tabular-nums">{formatDate(payment.paymentDate)}</Td>
                        <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                        <Td className="text-right font-medium tabular-nums">{money(payment.amount)}</Td>
                        <Td className="max-w-56 whitespace-normal break-words text-muted-foreground">{payment.note || "—"}</Td>
                        <Td className="text-muted-foreground">{payment.recordedBy?.name ?? (payment.method === "DEMO_PAY" ? "Customer" : "—")}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </FadeIn>

        <FadeIn delay={0.1} className="space-y-6">
          <Card className="p-5">
            <p className="text-sm font-medium">Summary</p>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{money(invoice.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums">
                  {toNumber(invoice.discountTotal) > 0 ? `− ${money(invoice.discountTotal)}` : money(0)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular-nums">{money(invoice.taxTotal)}</dd>
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{money(invoice.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums">{money(invoice.amountPaid)}</dd>
              </div>
              <div className={`flex justify-between font-medium ${overdue ? "text-destructive" : ""}`}>
                <dt>Balance due</dt>
                <dd className="tabular-nums">{money(balance)}</dd>
              </div>
            </dl>
          </Card>

          <InvoiceActions
            id={invoice.id}
            number={invoice.number}
            status={invoice.status}
            canConfirm={canConfirmInvoice(invoice.status)}
            canCancel={canCancelInvoice(invoice, invoice._count.payments)}
            hasPayments={invoice._count.payments > 0 || toNumber(invoice.amountPaid) > 0}
            payment={paymentBlocked ? null : { balance, balanceLabel: money(balance) }}
            overdue={overdue}
            sentAtLabel={invoice.sentAt ? formatDate(invoice.sentAt) : null}
          />
        </FadeIn>
      </div>
    </>
  );
}
