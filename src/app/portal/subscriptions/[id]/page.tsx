import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { isInvoiceOverdue } from "@/lib/billing";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { isOpenRequest } from "@/lib/subscriptions/quote-requests";
import {
  defaultRenewalTerm,
  formatDay,
  lineSubtotal,
  lineTaxAmount,
  paymentTermsLabel,
  subscriptionTotals,
  toDateInput,
} from "@/lib/subscriptions/subscriptions";
import { ButtonLink, Card, EmptyState, PageHeader, SectionHeader, Table, Td, Th } from "@/components/kit";
import { FadeIn } from "@/components/motion";
import { StatusBadge, StatusStepper } from "@/app/dashboard/subscriptions/status";
import { InvoiceStatusBadge, OverdueBadge } from "@/app/dashboard/invoices/status";
import { taxLabel } from "@/app/dashboard/subscriptions/data";
import { customerSubscriptionsWhere, showsNextBill } from "../data";
import { ManageSubscription } from "./manage-subscription";
import { Addons } from "./addons";
import { WithdrawRequest } from "./withdraw-request";

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

export default async function PortalSubscriptionPage({ params }: PageProps<"/portal/subscriptions/[id]">) {
  const user = await requireCustomer();

  const id = parseId((await params).id);
  if (!id) notFound();

  // Scoped to the signed-in customer: another customer's id (or a draft they didn't request) is a 404.
  const sub = await db.subscription.findFirst({
    where: { id, ...customerSubscriptionsWhere(user.id) },
    select: {
      id: true,
      number: true,
      status: true,
      requestedAt: true,
      notes: true,
      template: { select: { name: true } },
      startDate: true,
      expiryDate: true,
      nextInvoiceDate: true,
      paymentTermDays: true,
      quotationExpiresAt: true,
      plan: {
        select: { name: true, price: true, billingPeriod: true, closable: true, pausable: true, renewable: true },
      },
      lines: {
        orderBy: { id: "asc" },
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          product: { select: { name: true } },
          variant: { select: { attribute: true, value: true } },
          tax: { select: { name: true, rate: true } },
        },
      },
      // Draft invoices are internal; the customer sees them once confirmed.
      invoices: {
        where: { customerId: user.id, status: { not: "DRAFT" } },
        orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        select: { id: true, number: true, invoiceDate: true, dueDate: true, status: true, total: true, amountPaid: true },
      },
    },
  });
  if (!sub) notFound();

  // The customer's own request, still with the team: no dates, terms or invoices yet.
  const requested = isOpenRequest(sub);
  // Add-ons can be switched on and off while the subscription is running.
  const managesAddons = sub.status === "ACTIVE" || sub.status === "PAUSED";
  const addonProducts = managesAddons
    ? await db.product.findMany({
        where: { type: "ADDON", active: true },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, salesPrice: true, tax: { select: { name: true, rate: true } } },
      })
    : [];

  const unit = PERIOD_UNIT[sub.plan.billingPeriod];
  const lines = sub.lines.map((line) => {
    const priced = { quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate };
    return { ...line, amount: lineSubtotal(priced), taxAmount: lineTaxAmount(priced) };
  });
  const totals = subscriptionTotals(
    sub.plan.price,
    sub.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate })),
  );
  const now = new Date();
  const productIdsOnSub = new Set(sub.lines.map((line) => line.productId));
  const addons = addonProducts.map((product) => ({
    id: product.id,
    name: product.name,
    price: `${formatMoney(product.salesPrice)} / ${unit}`,
    tax: product.tax ? taxLabel(product.tax) : null,
    on: productIdsOnSub.has(product.id),
  }));

  return (
    <>
      <ButtonLink href="/portal/subscriptions" variant="ghost" className="mb-2 -ml-3 text-muted-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Subscriptions
      </ButtonLink>

      <PageHeader
        title={sub.number}
        description={`${sub.plan.name} · ${PERIOD_LABEL[sub.plan.billingPeriod]}`}
        actions={<StatusBadge status={sub.status} requested={requested} />}
      />

      <FadeIn>
        <Card className="mb-6">
          <StatusStepper status={sub.status} requested={requested} />
        </Card>
      </FadeIn>

      {requested ? (
        <Card className="mb-6">
          <SectionHeader
            title="Your quotation request"
            description="Our team will review this and send you a quotation."
            actions={<WithdrawRequest id={sub.id} number={sub.number} />}
          />
          <dl className="divide-y">
            <Detail label="Plan">
              {sub.plan.name} <span className="font-normal text-muted-foreground">· {PERIOD_LABEL[sub.plan.billingPeriod]}</span>
            </Detail>
            <Detail label="Preferred start date">{formatDay(sub.startDate)}</Detail>
            {sub.template && <Detail label="Package">{sub.template.name}</Detail>}
            <Detail label="Requested on">{formatDay(sub.requestedAt)}</Detail>
          </dl>
          {sub.notes && (
            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">Your note</p>
              <p className="mt-1 text-sm whitespace-pre-line">{sub.notes}</p>
            </div>
          )}
        </Card>
      ) : (
        <>
          <Card className="mb-6">
            <SectionHeader title="Plan & dates" />
            <dl className="divide-y">
              <Detail label="Plan">
                {sub.plan.name} <span className="font-normal text-muted-foreground">· {PERIOD_LABEL[sub.plan.billingPeriod]}</span>
              </Detail>
              <Detail label="Start date">{formatDay(sub.startDate)}</Detail>
              <Detail label="Expiry date">{sub.expiryDate ? formatDay(sub.expiryDate) : "Until closed"}</Detail>
              <Detail label="Next bill">{showsNextBill(sub.status) ? formatDay(sub.nextInvoiceDate) : "—"}</Detail>
              <Detail label="Payment terms">{paymentTermsLabel(sub.paymentTermDays)}</Detail>
              {sub.status === "QUOTATION" && sub.quotationExpiresAt && (
                <Detail label="Quotation valid until">{formatDay(sub.quotationExpiresAt)}</Detail>
              )}
            </dl>
          </Card>

          <ManageSubscription
            id={sub.id}
            number={sub.number}
            status={sub.status}
            closable={sub.plan.closable}
            pausable={sub.plan.pausable}
            renewable={sub.plan.renewable}
            startDate={formatDay(sub.startDate)}
            expiryInput={toDateInput(sub.expiryDate)}
            expiryDate={formatDay(sub.expiryDate)}
            defaultRenewalTerm={defaultRenewalTerm(sub.plan.billingPeriod)}
          />
        </>
      )}

      {addons.length > 0 && <Addons subscriptionId={sub.id} addons={addons} />}

      <Table>
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Variant</Th>
            <Th className="text-right">Qty</Th>
            <Th className="text-right">Unit price</Th>
            <Th>Tax</Th>
            <Th className="text-right">Amount</Th>
          </tr>
        </thead>
        <tbody>
          <tr className="bg-muted/20">
            <Td>
              <div className="font-medium">{sub.plan.name}</div>
              <div className="text-xs text-muted-foreground">Plan base fee</div>
            </Td>
            <Td className="text-muted-foreground">—</Td>
            <Td className="text-right tabular-nums">1</Td>
            <Td className="text-right tabular-nums">{formatMoney(totals.baseFee)}</Td>
            <Td className="text-muted-foreground">—</Td>
            <Td className="text-right tabular-nums">{formatMoney(totals.baseFee)}</Td>
          </tr>
          {lines.map((line) => (
            <tr key={line.id} className="transition-colors hover:bg-muted/40">
              <Td className="font-medium">{line.product.name}</Td>
              <Td>
                {line.variant ? (
                  `${line.variant.attribute}: ${line.variant.value}`
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Td>
              <Td className="text-right tabular-nums">{line.quantity}</Td>
              <Td className="text-right tabular-nums">{formatMoney(line.unitPrice)}</Td>
              <Td>
                {line.tax ? (
                  <>
                    {taxLabel(line.tax)}
                    <div className="text-xs text-muted-foreground tabular-nums">{formatMoney(line.taxAmount)}</div>
                  </>
                ) : (
                  <span className="text-muted-foreground">No tax</span>
                )}
              </Td>
              <Td className="text-right tabular-nums">{formatMoney(line.amount)}</Td>
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="mt-6 flex justify-end">
        <Card className="w-full md:w-80">
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
          <p className="mt-2 text-xs text-muted-foreground">
            {requested
              ? "An estimate before any discounts. Your quotation confirms the final prices."
              : `Billed every ${unit}, before any discounts.`}
          </p>
        </Card>
      </div>

      {!requested && (
        <section className="mt-6">
          <SectionHeader title="Invoices" description="Bills raised for this subscription." />
          {sub.invoices.length === 0 ? (
            <EmptyState message="No invoices for this subscription yet." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Number</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {sub.invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <Td className="font-medium tabular-nums">{invoice.number}</Td>
                    <Td className="tabular-nums">{formatDay(invoice.invoiceDate)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                        {isInvoiceOverdue(invoice, now) && <OverdueBadge />}
                      </div>
                    </Td>
                    <Td className="text-right tabular-nums">{formatMoney(invoice.total)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      )}
    </>
  );
}
