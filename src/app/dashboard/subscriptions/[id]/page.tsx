import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import {
  formatDay,
  isEditableStatus,
  isQuotationExpired,
  lineSubtotal,
  lineTaxAmount,
  paymentTermsLabel,
  defaultRenewalTerm,
  subscriptionTotals,
  toDateInput,
} from "@/lib/subscriptions/subscriptions";
import { Badge, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/kit";
import { FadeIn, Stagger } from "@/components/motion";
import { StatusBadge, StatusStepper } from "../status";
import { taxLabel } from "../data";
import { StatusActions } from "./status-actions";

function parseId(raw: string) {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export default async function SubscriptionPage({ params }: PageProps<"/dashboard/subscriptions/[id]">) {
  await requireTeam();

  const id = parseId((await params).id);
  if (!id) notFound();

  const sub = await db.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      startDate: true,
      expiryDate: true,
      nextInvoiceDate: true,
      paymentTermDays: true,
      quotationExpiresAt: true,
      notes: true,
      confirmedAt: true,
      closedAt: true,
      createdAt: true,
      updatedAt: true,
      customer: { select: { name: true, email: true, company: true, phone: true } },
      salesperson: { select: { name: true } },
      plan: { select: { name: true, price: true, billingPeriod: true, closable: true, pausable: true, renewable: true } },
      template: { select: { id: true, name: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          product: { select: { name: true } },
          variant: { select: { attribute: true, value: true } },
          tax: { select: { name: true, rate: true } },
        },
      },
    },
  });
  if (!sub) notFound();

  const editable = isEditableStatus(sub.status);
  const quoteExpired = sub.status === "QUOTATION" && isQuotationExpired(sub.quotationExpiresAt);
  const unit = PERIOD_UNIT[sub.plan.billingPeriod];
  const lines = sub.lines.map((line) => {
    const priced = { quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate };
    return { ...line, amount: lineSubtotal(priced), taxAmount: lineTaxAmount(priced) };
  });
  const totals = subscriptionTotals(
    sub.plan.price,
    sub.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate })),
  );

  return (
    <>
      <ButtonLink href="/dashboard/subscriptions" variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Subscriptions
      </ButtonLink>

      <PageHeader
        title={sub.number}
        description={`${sub.customer.name} · ${sub.plan.name} · created ${formatDay(sub.createdAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={sub.status} />
            {quoteExpired && <Badge tone="amber">Quotation expired</Badge>}
            {editable && (
              // Secondary: the status action below is this page's primary.
              <ButtonLink href={`/dashboard/subscriptions/${sub.id}/edit`} variant="secondary">
                <Pencil className="size-4" aria-hidden /> Edit
              </ButtonLink>
            )}
          </div>
        }
      />

      <FadeIn>
        <Card className="mb-6">
          <StatusStepper status={sub.status} />
          <div className="mt-6 border-t pt-4">
            <StatusActions
              id={sub.id}
              number={sub.number}
              status={sub.status}
              closable={sub.plan.closable}
              pausable={sub.plan.pausable}
              renewable={sub.plan.renewable}
              quoteExpired={quoteExpired}
              quotationExpiresAt={formatDay(sub.quotationExpiresAt)}
              startDate={formatDay(sub.startDate)}
              closedAt={formatDay(sub.closedAt)}
              // No pausedAt column: the last update of a paused subscription is when it was paused.
              pausedSince={formatDay(sub.updatedAt)}
              expiryInput={toDateInput(sub.expiryDate)}
              expiryDate={formatDay(sub.expiryDate)}
              defaultRenewalTerm={defaultRenewalTerm(sub.plan.billingPeriod)}
            />
          </div>
        </Card>
      </FadeIn>

      <Stagger className="mb-6 grid gap-6 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-base font-semibold">Customer</h2>
          <dl className="divide-y">
            <Detail label="Name">{sub.customer.name}</Detail>
            <Detail label="Email">{sub.customer.email}</Detail>
            {sub.customer.company && <Detail label="Company">{sub.customer.company}</Detail>}
            {sub.customer.phone && <Detail label="Phone">{sub.customer.phone}</Detail>}
            <Detail label="Salesperson">{sub.salesperson?.name ?? "—"}</Detail>
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 text-base font-semibold">Plan & dates</h2>
          <dl className="divide-y">
            <Detail label="Plan">
              {sub.plan.name} <span className="font-normal text-muted-foreground">· {PERIOD_LABEL[sub.plan.billingPeriod]}</span>
            </Detail>
            <Detail label="Start date">{formatDay(sub.startDate)}</Detail>
            <Detail label="Expiry date">{sub.expiryDate ? formatDay(sub.expiryDate) : "Until closed"}</Detail>
            <Detail label="Next invoice">{sub.status === "CLOSED" ? "—" : formatDay(sub.nextInvoiceDate)}</Detail>
            <Detail label="Payment terms">{paymentTermsLabel(sub.paymentTermDays)}</Detail>
            <Detail label="Template">
              {sub.template ? (
                <Link href={`/dashboard/templates/${sub.template.id}`} className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
                  {sub.template.name}
                </Link>
              ) : (
                "—"
              )}
            </Detail>
            {sub.quotationExpiresAt && (
              <Detail label="Quotation valid until">
                {formatDay(sub.quotationExpiresAt)}
              </Detail>
            )}
            {sub.confirmedAt && <Detail label="Confirmed">{formatDay(sub.confirmedAt)}</Detail>}
            {sub.closedAt && <Detail label="Closed">{formatDay(sub.closedAt)}</Detail>}
          </dl>
        </Card>
      </Stagger>

      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Unit price</Th>
            <Th>Tax</Th>
            <Th className="text-right">Tax amount</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/20">
            <Td>
              <div className="font-medium">{sub.plan.name}</div>
              <div className="text-xs text-muted-foreground">Plan base fee</div>
            </Td>
            <Td className="text-right tabular-nums">1</Td>
            <Td className="text-right tabular-nums">{formatMoney(totals.baseFee)}</Td>
            <Td className="text-muted-foreground">—</Td>
            <Td className="text-right tabular-nums">{formatMoney(0)}</Td>
            <Td className="text-right tabular-nums">{formatMoney(totals.baseFee)}</Td>
          </tr>
          {lines.map((line) => (
            <tr key={line.id} className="transition-colors hover:bg-muted/40">
              <Td>
                <div className="font-medium">{line.product.name}</div>
                {line.variant && (
                  <div className="text-xs text-muted-foreground">
                    {line.variant.attribute}: {line.variant.value}
                  </div>
                )}
              </Td>
              <Td className="text-right tabular-nums">{line.quantity}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.unitPrice)}</Td>
              <Td>{line.tax ? taxLabel(line.tax) : <span className="text-muted-foreground">No tax</span>}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.taxAmount)}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.amount)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_20rem]">
        <div>
          {sub.notes && (
            <Card className="animate-in fade-in duration-700">
              <h2 className="mb-1 text-base font-semibold">Notes</h2>
              <p className="text-sm whitespace-pre-line text-muted-foreground">{sub.notes}</p>
            </Card>
          )}
        </div>
        <Card className="animate-in fade-in slide-in-from-bottom-1 duration-700">
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Plan base fee</dt>
              <dd className="tabular-nums">{formatMoney(totals.baseFee)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Products</dt>
              <dd className="tabular-nums">{formatMoney(totals.productsSubtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
            </div>
            <div className="flex justify-between gap-4 text-muted-foreground">
              <dt>Tax</dt>
              <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
            </div>
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>Total / {unit}</dt>
              <dd className="tabular-nums">{formatMoney(totals.total)}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">Recurring every {unit}, before discounts.</p>
        </Card>
      </div>
    </>
  );
}
