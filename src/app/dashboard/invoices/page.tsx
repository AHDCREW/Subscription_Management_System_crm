import Link from "next/link";
import Form from "next/form";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, round2, toNumber } from "@/lib/money";
import { isInvoiceOverdue, toUtcDate } from "@/lib/billing";
import { getLastBillingRun } from "@/lib/billing/run";
import { Button, ButtonLink, EmptyState, Input, PageHeader, Table, Td, Th } from "@/components/kit";
import { StatCard } from "@/components/motion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BillingRunPanel } from "./run-billing";
import { InvoiceStatusBadge, OverdueBadge } from "./status";

const PAGE_SIZE = 25;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft", status: "DRAFT" },
  { value: "confirmed", label: "Confirmed", status: "CONFIRMED" },
  { value: "paid", label: "Paid", status: "PAID" },
  { value: "cancelled", label: "Cancelled", status: "CANCELLED" },
  { value: "overdue", label: "Overdue" },
] as const satisfies readonly { value: string; label: string; status?: InvoiceStatus }[];

type FilterValue = (typeof FILTERS)[number]["value"];

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function currencySymbol(currency: string) {
  const parts = new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? "";
}

export default async function InvoicesPage({ searchParams }: PageProps<"/dashboard/invoices">) {
  await requireTeam();

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 100);
  const filter: FilterValue = FILTERS.find((f) => f.value === first(params.status))?.value ?? "all";
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const now = new Date();
  const today = toUtcDate(now);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  // Overdue = confirmed, not fully paid, due before today.
  const overdueWhere: Prisma.InvoiceWhereInput = {
    status: "CONFIRMED",
    dueDate: { lt: today },
    amountPaid: { lt: db.invoice.fields.total },
  };

  const searchWhere: Prisma.InvoiceWhereInput = q
    ? {
        OR: [
          { number: { contains: q } },
          { customer: { name: { contains: q } } },
          { customer: { email: { contains: q } } },
          { customer: { company: { contains: q } } },
          { subscription: { number: { contains: q } } },
        ],
      }
    : {};

  const selected = FILTERS.find((f) => f.value === filter);
  const filterWhere: Prisma.InvoiceWhereInput =
    filter === "overdue" ? overdueWhere : selected && "status" in selected ? { status: selected.status } : {};
  const where: Prisma.InvoiceWhereInput = { AND: [filterWhere, searchWhere] };

  const [settings, draftCount, outstanding, overdue, paidThisMonth, statusCounts, overdueCount, total] =
    await Promise.all([
      db.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
      db.invoice.count({ where: { status: "DRAFT" } }),
      db.invoice.aggregate({ where: { status: "CONFIRMED" }, _sum: { total: true, amountPaid: true }, _count: true }),
      db.invoice.aggregate({ where: overdueWhere, _sum: { total: true, amountPaid: true }, _count: true }),
      db.payment.aggregate({ where: { paymentDate: { gte: monthStart } }, _sum: { amount: true }, _count: true }),
      db.invoice.groupBy({ by: ["status"], where: searchWhere, _count: { _all: true } }),
      db.invoice.count({ where: { AND: [overdueWhere, searchWhere] } }),
      db.invoice.count({ where }),
    ]);

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
      customer: { select: { name: true, company: true } },
      subscription: { select: { id: true, number: true } },
    },
  });

  const countFor = (value: FilterValue) => {
    if (value === "overdue") return overdueCount;
    const option = FILTERS.find((f) => f.value === value);
    const rows = option && "status" in option ? statusCounts.filter((row) => row.status === option.status) : statusCounts;
    return rows.reduce((sum, row) => sum + row._count._all, 0);
  };

  const href = (next: { status?: FilterValue; page?: number }) => {
    const sp = new URLSearchParams();
    const status = next.status ?? filter;
    if (q) sp.set("q", q);
    if (status !== "all") sp.set("status", status);
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/dashboard/invoices?${qs}` : "/dashboard/invoices";
  };

  const outstandingAmount = round2(toNumber(outstanding._sum.total) - toNumber(outstanding._sum.amountPaid));
  const overdueAmount = round2(toNumber(overdue._sum.total) - toNumber(overdue._sum.amountPaid));

  return (
    <>
      <PageHeader title="Invoices" description="Draft invoices from the billing run, what customers owe and what is overdue." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Draft invoices" value={draftCount} hint="Waiting to be confirmed" />
        <StatCard
          label="Outstanding"
          value={outstandingAmount}
          prefix={symbol}
          decimals={2}
          hint={`${outstanding._count} confirmed invoice${outstanding._count === 1 ? "" : "s"}`}
        />
        <StatCard
          label="Overdue"
          value={overdueAmount}
          prefix={symbol}
          decimals={2}
          hint={
            <span className={overdue._count > 0 ? "text-destructive" : undefined}>
              {overdue._count} invoice{overdue._count === 1 ? "" : "s"} past due
            </span>
          }
        />
        <StatCard
          label="Paid this month"
          value={toNumber(paidThisMonth._sum.amount)}
          prefix={symbol}
          decimals={2}
          hint={`${paidThisMonth._count} payment${paidThisMonth._count === 1 ? "" : "s"} received`}
        />
      </div>

      <BillingRunPanel initial={getLastBillingRun()} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter}>
          <TabsList>
            {FILTERS.map((option) => (
              <TabsTrigger key={option.value} value={option.value} asChild className="px-2.5">
                <Link href={href({ status: option.value })} scroll={false}>
                  {option.label}
                  <span className="text-xs tabular-nums text-muted-foreground">{countFor(option.value)}</span>
                </Link>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Form action="/dashboard/invoices" className="flex items-center gap-2">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <Input
            name="q"
            type="search"
            placeholder="Search number, customer, subscription…"
            defaultValue={q}
            className="w-72"
            aria-label="Search invoices"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <ButtonLink href={filter === "all" ? "/dashboard/invoices" : `/dashboard/invoices?status=${filter}`} variant="ghost">
              Clear
            </ButtonLink>
          )}
        </Form>
      </div>

      {invoices.length === 0 ? (
        <EmptyState
          message={
            q || filter !== "all"
              ? "No invoices match these filters."
              : "No invoices yet. Run billing to invoice active subscriptions that are due."
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Subscription</Th>
                <Th>Invoice date</Th>
                <Th>Due date</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Paid</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const overdueRow = isInvoiceOverdue(invoice, now);
                return (
                  <tr key={invoice.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <Link href={`/dashboard/invoices/${invoice.id}`} className="font-medium text-primary hover:underline">
                        {invoice.number}
                      </Link>
                    </Td>
                    <Td>
                      <div className="font-medium">{invoice.customer.name}</div>
                      {invoice.customer.company && (
                        <div className="text-xs text-muted-foreground">{invoice.customer.company}</div>
                      )}
                    </Td>
                    <Td className="tabular-nums">
                      {invoice.subscription?.number ?? <span className="text-muted-foreground">—</span>}
                    </Td>
                    <Td className="tabular-nums">{formatDate(invoice.invoiceDate)}</Td>
                    <Td className={overdueRow ? "font-medium text-destructive tabular-nums" : "tabular-nums"}>
                      {formatDate(invoice.dueDate)}
                    </Td>
                    <Td className="text-right tabular-nums">{money(invoice.total)}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{money(invoice.amountPaid)}</Td>
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
