import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, round2, toNumber } from "@/lib/money";
import { isInvoiceOverdue, outstandingAmount, toUtcDate } from "@/lib/billing";
import { Button, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/kit";
import { StatCard } from "@/components/motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceStatusBadge, OverdueBadge } from "@/app/dashboard/invoices/status";

export const metadata: Metadata = { title: "Invoices" };

const PAGE_SIZE = 25;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
] as const;

type FilterValue = (typeof FILTERS)[number]["value"];

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function currencySymbol(currency: string) {
  const parts = new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? "";
}

export default async function PortalInvoicesPage({ searchParams }: PageProps<"/portal/invoices">) {
  const user = await requireCustomer();

  const params = await searchParams;
  const filter: FilterValue = FILTERS.find((f) => f.value === first(params.status))?.value ?? "all";
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const now = new Date();
  const today = toUtcDate(now);
  const yearStart = new Date(Date.UTC(today.getUTCFullYear(), 0, 1));

  // Customers only ever see their own invoices, and never drafts (drafts are internal).
  const mine: Prisma.InvoiceWhereInput = { customerId: user.id, status: { not: "DRAFT" } };
  const unpaidWhere: Prisma.InvoiceWhereInput = {
    customerId: user.id,
    status: "CONFIRMED",
    amountPaid: { lt: db.invoice.fields.total },
  };
  const overdueWhere: Prisma.InvoiceWhereInput = { ...unpaidWhere, dueDate: { lt: today } };
  const paidWhere: Prisma.InvoiceWhereInput = { customerId: user.id, status: "PAID" };
  const filterWhere: Record<FilterValue, Prisma.InvoiceWhereInput> = { all: mine, unpaid: unpaidWhere, paid: paidWhere };
  const where = filterWhere[filter];

  const [settings, due, overdue, paidThisYear, allCount, unpaidCount, paidCount] = await Promise.all([
    db.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
    db.invoice.aggregate({ where: unpaidWhere, _sum: { total: true, amountPaid: true }, _count: true }),
    db.invoice.aggregate({ where: overdueWhere, _sum: { total: true, amountPaid: true }, _count: true }),
    db.payment.aggregate({
      where: { paymentDate: { gte: yearStart }, invoice: mine },
      _sum: { amount: true },
      _count: true,
    }),
    db.invoice.count({ where: mine }),
    db.invoice.count({ where: unpaidWhere }),
    db.invoice.count({ where: paidWhere }),
  ]);
  const counts: Record<FilterValue, number> = { all: allCount, unpaid: unpaidCount, paid: paidCount };
  const total = counts[filter];

  const currency = settings?.currency ?? "INR";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const symbol = currencySymbol(currency);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const invoices = await db.invoice.findMany({
    where,
    orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      number: true,
      status: true,
      invoiceDate: true,
      dueDate: true,
      total: true,
      amountPaid: true,
    },
  });

  const href = (next: { status?: FilterValue; page?: number }) => {
    const sp = new URLSearchParams();
    const status = next.status ?? filter;
    if (status !== "all") sp.set("status", status);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/portal/invoices?${qs}` : "/portal/invoices";
  };

  const amountDue = round2(toNumber(due._sum.total) - toNumber(due._sum.amountPaid));
  const overdueAmount = round2(toNumber(overdue._sum.total) - toNumber(overdue._sum.amountPaid));
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  return (
    <>
      <PageHeader title="Invoices" description="Your invoices, what you owe and what you have paid." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Amount due"
          value={amountDue}
          prefix={symbol}
          decimals={2}
          hint={plural(due._count, "unpaid invoice")}
        />
        <StatCard
          label="Overdue amount"
          value={overdueAmount}
          prefix={symbol}
          decimals={2}
          hint={
            <span className={overdue._count > 0 ? "text-destructive" : undefined}>
              {plural(overdue._count, "invoice")} past due
            </span>
          }
        />
        <StatCard
          label="Paid this year"
          value={toNumber(paidThisYear._sum.amount)}
          prefix={symbol}
          decimals={2}
          hint={`${plural(paidThisYear._count, "payment")} since ${formatDate(yearStart)}`}
        />
      </div>

      <div className="mb-4">
        <Tabs value={filter}>
          <TabsList>
            {FILTERS.map((option) => (
              <TabsTrigger key={option.value} value={option.value} asChild className="px-2.5">
                <Link href={href({ status: option.value })} scroll={false}>
                  {option.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{counts[option.value]}</span>
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          message={
            filter === "unpaid"
              ? "Nothing to pay. You're all caught up."
              : filter === "paid"
                ? "No paid invoices yet."
                : "No invoices yet. They will appear here once you are billed."
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Invoice date</Th>
                <Th>Due date</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const overdueRow = isInvoiceOverdue(invoice, now);
                const balance = invoice.status === "CANCELLED" ? null : outstandingAmount(invoice.total, invoice.amountPaid);
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <Link
                        href={`/portal/invoices/${invoice.id}`}
                        className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                      >
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td className="tabular-nums">{formatDate(invoice.invoiceDate)}</Td>
                    <Td className={overdueRow ? "font-medium text-destructive tabular-nums" : "tabular-nums"}>
                      {formatDate(invoice.dueDate)}
                    </Td>
                    <Td className="text-right tabular-nums">{money(invoice.total)}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{money(invoice.amountPaid)}</Td>
                    <Td className={overdueRow ? "text-right font-semibold tabular-nums text-destructive" : "text-right font-semibold tabular-nums"}>
                      {balance === null ? <span className="font-normal text-muted-foreground">—</span> : money(balance)}
                    </Td>
                    <Td>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <InvoiceStatusBadge status={invoice.status} />
                        {overdueRow && <OverdueBadge />}
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + invoices.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={href({ page: page - 1 })} variant="secondary">
                    Previous
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Previous
                  </Button>
                )}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <ButtonLink href={href({ page: page + 1 })} variant="secondary">
                    Next
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
