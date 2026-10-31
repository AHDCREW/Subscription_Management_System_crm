import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { formatDate, formatMoney, toNumber } from "@/lib/money";
import { outstandingAmount } from "@/lib/billing";
import { SUBSCRIPTION_STATUSES, formatDay } from "@/lib/subscriptions/subscriptions";
import { PAYMENT_METHOD_LABEL, currencySymbol, daysOverdue, pluralDays } from "@/lib/reports/format";
import { getDashboardData } from "@/lib/reports/queries";
import { Card, EmptyState, PageHeader, SectionHeader, Table, Td, Th } from "@/components/kit";
import { StatCard } from "@/components/motion";
import { StatusBadge } from "./subscriptions/status";
import { RevenueChart } from "./revenue-chart";

const linkClass = "underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground";

export default async function DashboardPage() {
  const user = await requireTeam();
  const data = await getDashboardData();
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, data.currency);
  const symbol = currencySymbol(data.currency);
  const totalSubscriptions = [...data.subscriptionsByStatus.values()].reduce((sum, n) => sum + n, 0);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Brightloop Software at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          className="lg:col-span-2"
          label="Active subscriptions"
          value={data.activeSubscriptions}
          hint={`${totalSubscriptions} in total`}
        />
        <StatCard featured className="lg:col-span-2" label="MRR" value={data.mrr} prefix={symbol} hint="Monthly recurring revenue · excl. tax, before discounts" />
        <StatCard
          className="lg:col-span-2"
          label="Revenue this month"
          value={data.revenueThisMonth.amount}
          prefix={symbol}
          hint={`${data.revenueThisMonth.count} payment${data.revenueThisMonth.count === 1 ? "" : "s"} received`}
        />
        <StatCard
          className="lg:col-span-3"
          label="Outstanding"
          value={data.outstanding.amount}
          prefix={symbol}
          hint={`${data.outstanding.count} confirmed invoice${data.outstanding.count === 1 ? "" : "s"} not fully paid`}
        />
        <StatCard
          className="lg:col-span-3"
          label="Overdue"
          value={data.overdue.amount}
          prefix={symbol}
          hint={
            <span className={data.overdue.count > 0 ? "text-destructive" : undefined}>
              {data.overdue.count} invoice{data.overdue.count === 1 ? "" : "s"} past due
            </span>
          }
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionHeader title="Revenue" description="Payments received per month, last 6 months." />
          <RevenueChart months={data.revenueMonths} currency={data.currency} />
        </Card>

        <Card>
          <SectionHeader
            title="Subscriptions by status"
            actions={
              <Link href="/dashboard/reports?tab=subscriptions" className={`text-sm ${linkClass}`}>
                Report
              </Link>
            }
          />
          <ul className="divide-y">
            {SUBSCRIPTION_STATUSES.map((status) => {
              const count = data.subscriptionsByStatus.get(status) ?? 0;
              return (
                <li key={status} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <Link
                    href={`/dashboard/reports?tab=subscriptions&status=${status.toLowerCase()}`}
                    aria-label={`${count} ${status.toLowerCase()} subscriptions`}
                    className="rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <StatusBadge status={status} />
                  </Link>
                  <span className="text-sm tabular-nums">
                    {count}
                    {totalSubscriptions > 0 && (
                      <span className="ml-2 inline-block w-10 text-right text-xs text-muted-foreground">
                        {Math.round((count / totalSubscriptions) * 100)}%
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section>
          <SectionHeader
            title="Overdue invoices"
            description="Most overdue first."
            actions={
              <Link href="/dashboard/reports?tab=overdue" className={`text-sm ${linkClass}`}>
                View all
              </Link>
            }
          />
          {data.topOverdue.length === 0 ? (
            <EmptyState message="Nothing overdue. Every confirmed invoice is paid or not yet due." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th>
                  <Th>Customer</Th>
                  <Th>Due</Th>
                  <Th className="text-right">Overdue</Th>
                  <Th className="text-right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {data.topOverdue.map((invoice) => (
                  <tr key={invoice.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <Link href={`/dashboard/invoices/${invoice.id}`} className={`font-medium tabular-nums ${linkClass}`}>
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td className="max-w-40 truncate">{invoice.customer.name}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDay(invoice.dueDate)}</Td>
                    <Td className="whitespace-nowrap text-right font-medium text-destructive tabular-nums">
                      {pluralDays(daysOverdue(invoice.dueDate, data.today))}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {money(outstandingAmount(invoice.total, invoice.amountPaid))}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>

        <section>
          <SectionHeader
            title="Recent payments"
            description="The last five payments received."
            actions={
              <Link href="/dashboard/reports?tab=payments" className={`text-sm ${linkClass}`}>
                View all
              </Link>
            }
          />
          {data.recentPayments.length === 0 ? (
            <EmptyState message="No payments recorded yet." />
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Customer</Th>
                  <Th>Invoice</Th>
                  <Th>Method</Th>
                  <Th className="text-right">Amount</Th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.map((payment) => (
                  <tr key={payment.id} className="transition-colors hover:bg-muted/40">
                    <Td className="whitespace-nowrap tabular-nums">{formatDate(payment.paymentDate)}</Td>
                    <Td className="max-w-36 truncate">{payment.invoice.customer.name}</Td>
                    <Td>
                      <Link href={`/dashboard/invoices/${payment.invoice.id}`} className={`tabular-nums ${linkClass}`}>
                        {payment.invoice.number}
                      </Link>
                    </Td>
                    <Td className="whitespace-nowrap">{PAYMENT_METHOD_LABEL[payment.method]}</Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">{money(toNumber(payment.amount))}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </section>
      </div>
    </>
  );
}
