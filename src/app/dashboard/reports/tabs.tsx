import Link from "next/link";
import { formatDate, formatMoney, toNumber } from "@/lib/money";
import { isInvoiceOverdue } from "@/lib/billing";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { hasFilters, reportHref } from "@/lib/reports/filters";
import { PAYMENT_METHOD_LABEL, daysOverdue, pluralDays } from "@/lib/reports/format";
import {
  invoiceBalance,
  invoicesReport,
  overdueReport,
  paymentsReport,
  rowMonthlyValue,
  subscriptionsReport,
  type ResolvedFilters,
} from "@/lib/reports/queries";
import { Badge, EmptyState, Table, Td, Th } from "@/components/kit";
import { StatusBadge } from "../subscriptions/status";
import { InvoiceStatusBadge, OverdueBadge } from "../invoices/status";
import { Pagination, SummaryStrip, linkClass } from "./report-ui";

// One async server component per report tab: summary strip, one page of rows, pagination.

type TabProps = { filters: ResolvedFilters; currency: string };

function emptyMessage(filters: ResolvedFilters, nothing: string) {
  return hasFilters(filters) ? "Nothing matches these filters." : nothing;
}

function CustomerCell({ name, email }: { name: string; email: string }) {
  return (
    <Td>
      <div className="font-medium">{name}</div>
      <div className="text-xs text-muted-foreground">{email}</div>
    </Td>
  );
}

export async function SubscriptionsTab({ filters, currency }: TabProps) {
  const { summary, window, rows } = await subscriptionsReport(filters);
  const money = (value: number) => formatMoney(value, currency);

  return (
    <>
      <SummaryStrip
        items={[
          { label: "Subscriptions", value: summary.count },
          { label: "Active", value: summary.active },
          { label: "MRR (active)", value: money(summary.mrr) },
          { label: "Monthly value (all listed)", value: money(summary.monthlyValue) },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage(filters, "No subscriptions yet.")} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th>Start</Th>
                <Th>Expiry</Th>
                <Th>Next invoice</Th>
                <Th className="text-right">MRR value</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sub) => (
                <tr key={sub.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <Link href={`/dashboard/subscriptions/${sub.id}`} className={`font-medium tabular-nums ${linkClass}`}>
                      {sub.number}
                    </Link>
                  </Td>
                  <CustomerCell name={sub.customer.name} email={sub.customer.email} />
                  <Td>{sub.plan.name}</Td>
                  <Td>
                    <StatusBadge status={sub.status} />
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">{formatDay(sub.startDate)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">{formatDay(sub.expiryDate)}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {sub.status === "CLOSED" ? "—" : formatDay(sub.nextInvoiceDate)}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{money(rowMonthlyValue(sub))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination
            {...window}
            shown={rows.length}
            href={(page) => reportHref(filters, { page })}
          />
          <p className="mt-2 text-xs text-muted-foreground">MRR value: recurring amount per month, excluding tax and before discounts.</p>
        </>
      )}
    </>
  );
}

export async function InvoicesTab({ filters, currency, today }: TabProps & { today: Date }) {
  const { summary, window, rows } = await invoicesReport(filters, today);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);

  return (
    <>
      <SummaryStrip
        items={[
          { label: "Invoices", value: summary.count },
          { label: "Billed (confirmed + paid)", value: money(summary.billed) },
          { label: "Paid", value: money(summary.paid) },
          {
            label: "Balance due",
            value: (
              <>
                {money(summary.balance)}
                {summary.overdueCount > 0 && (
                  <span className="ml-2 text-xs font-medium text-destructive">{summary.overdueCount} overdue</span>
                )}
              </>
            ),
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage(filters, "No invoices yet.")} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
                <Th>Invoice date</Th>
                <Th>Due date</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => {
                const overdue = isInvoiceOverdue(invoice, today);
                const balance = invoiceBalance(invoice);
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <Link href={`/dashboard/invoices/${invoice.id}`} className={`font-medium tabular-nums ${linkClass}`}>
                        {invoice.number}
                      </Link>
                    </Td>
                    <CustomerCell name={invoice.customer.name} email={invoice.customer.email} />
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                        {overdue && <OverdueBadge />}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDay(invoice.invoiceDate)}</Td>
                    <Td className={`whitespace-nowrap tabular-nums ${overdue ? "font-medium text-destructive" : ""}`}>
                      {formatDay(invoice.dueDate)}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(invoice.total)}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{money(invoice.amountPaid)}</Td>
                    <Td className="whitespace-nowrap text-right font-medium tabular-nums">
                      {balance === null ? <span className="font-normal text-muted-foreground">—</span> : money(balance)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
          <Pagination {...window} shown={rows.length} href={(page) => reportHref(filters, { page })} />
        </>
      )}
    </>
  );
}

export async function PaymentsTab({ filters, currency }: TabProps) {
  const { summary, window, rows } = await paymentsReport(filters);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);

  return (
    <>
      <SummaryStrip
        items={[
          { label: "Payments", value: summary.count },
          { label: "Received", value: money(summary.amount) },
          { label: "Average payment", value: summary.count ? money(summary.amount / summary.count) : "—" },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage(filters, "No payments recorded yet.")} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th>Note</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-muted/40">
                  <Td className="whitespace-nowrap tabular-nums">{formatDate(payment.paymentDate)}</Td>
                  <Td>
                    <Link href={`/dashboard/invoices/${payment.invoice.id}`} className={`font-medium tabular-nums ${linkClass}`}>
                      {payment.invoice.number}
                    </Link>
                  </Td>
                  <CustomerCell name={payment.invoice.customer.name} email={payment.invoice.customer.email} />
                  <Td>
                    <Badge tone="outline">{PAYMENT_METHOD_LABEL[payment.method]}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{money(toNumber(payment.amount))}</Td>
                  <Td className="max-w-64 truncate text-muted-foreground" title={payment.note ?? undefined}>
                    {payment.note || "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination {...window} shown={rows.length} href={(page) => reportHref(filters, { page })} />
        </>
      )}
    </>
  );
}

export async function OverdueTab({ filters, currency, today }: TabProps & { today: Date }) {
  const { summary, window, rows } = await overdueReport(filters, today);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);

  return (
    <>
      <SummaryStrip
        items={[
          { label: "Overdue invoices", value: summary.count, tone: summary.count > 0 ? "danger" : undefined },
          { label: "Balance overdue", value: money(summary.balance), tone: summary.count > 0 ? "danger" : undefined },
          {
            label: "Oldest",
            value: summary.oldestDueDate ? pluralDays(daysOverdue(summary.oldestDueDate, today)) : "—",
          },
          {
            label: "Average balance",
            value: summary.count ? money(summary.balance / summary.count) : "—",
          },
        ]}
      />
      {rows.length === 0 ? (
        <EmptyState
          message={emptyMessage(filters, "Nothing overdue. Every confirmed invoice is paid or not yet due.")}
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Due date</Th>
                <Th className="text-right">Days overdue</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((invoice) => (
                <tr key={invoice.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <Link href={`/dashboard/invoices/${invoice.id}`} className={`font-medium tabular-nums ${linkClass}`}>
                      {invoice.number}
                    </Link>
                  </Td>
                  <CustomerCell name={invoice.customer.name} email={invoice.customer.email} />
                  <Td className="whitespace-nowrap tabular-nums">{formatDay(invoice.dueDate)}</Td>
                  <Td className="whitespace-nowrap text-right font-medium text-destructive tabular-nums">
                    {pluralDays(daysOverdue(invoice.dueDate, today))}
                  </Td>
                  <Td className="whitespace-nowrap text-right tabular-nums">{money(invoice.total)}</Td>
                  <Td className="whitespace-nowrap text-right tabular-nums text-muted-foreground">{money(invoice.amountPaid)}</Td>
                  <Td className="whitespace-nowrap text-right font-medium tabular-nums">{money(invoiceBalance(invoice) ?? 0)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <Pagination {...window} shown={rows.length} href={(page) => reportHref(filters, { page })} />
        </>
      )}
    </>
  );
}
