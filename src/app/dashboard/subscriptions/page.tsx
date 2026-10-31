import Link from "next/link";
import Form from "next/form";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { Search } from "lucide-react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { OPEN_REQUEST, isOpenRequest } from "@/lib/subscriptions/quote-requests";
import {
  STATUS_INFO,
  SUBSCRIPTIONS_PAGE_SIZE,
  SUBSCRIPTION_STATUSES,
  formatDay,
  isSubscriptionStatus,
  subscriptionNumber,
  subscriptionTotals,
} from "@/lib/subscriptions/subscriptions";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Table, Td, Th, cx } from "@/components/kit";
import { StatusBadge } from "./status";

const PAGE_SIZE = SUBSCRIPTIONS_PAGE_SIZE;
// Cap on customers matched by a name/email search before filtering subscriptions.
const MAX_CUSTOMER_MATCHES = 500;

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

// Search uses indexed columns only: the unique `number`, and `customerId`
// for customers matched by name or email.
async function searchWhere(q: string): Promise<Prisma.SubscriptionWhereInput> {
  if (!q) return {};
  const or: Prisma.SubscriptionWhereInput[] = [];

  const numberMatch = /^(?:sub-?)?(\d{1,9})$/i.exec(q);
  if (numberMatch) or.push({ number: subscriptionNumber(Number(numberMatch[1])) });
  if (/^sub/i.test(q)) or.push({ number: { startsWith: q.toUpperCase() } });

  const customers = await db.user.findMany({
    where: { role: "CUSTOMER", OR: [{ name: { contains: q } }, { email: { contains: q } }] },
    select: { id: true },
    take: MAX_CUSTOMER_MATCHES,
  });
  if (customers.length) or.push({ customerId: { in: customers.map((c) => c.id) } });

  // Nothing can match: an impossible id keeps the query on the primary key.
  return or.length ? { OR: or } : { id: -1 };
}

export default async function SubscriptionsPage({ searchParams }: PageProps<"/dashboard/subscriptions">) {
  await requireTeam();

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 120);
  // ?view=requests lists the customers' quotation requests (Drafts from the portal) instead of a status.
  const requestsOnly = first(params.view) === "requests";
  const statusParam = first(params.status).toUpperCase();
  const status: SubscriptionStatus | undefined =
    !requestsOnly && isSubscriptionStatus(statusParam) ? statusParam : undefined;
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const base = await searchWhere(q);
  const where: Prisma.SubscriptionWhereInput = requestsOnly ? { ...base, ...OPEN_REQUEST } : { ...base, ...(status && { status }) };

  const [counts, requestCount, total] = await Promise.all([
    db.subscription.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.subscription.count({ where: { ...base, ...OPEN_REQUEST } }),
    db.subscription.count({ where }),
  ]);
  const countByStatus = new Map(counts.map((c) => [c.status, c._count._all]));
  const allCount = counts.reduce((sum, c) => sum + c._count._all, 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const subscriptions = await db.subscription.findMany({
    where,
    orderBy: { id: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      number: true,
      status: true,
      requestedAt: true,
      startDate: true,
      expiryDate: true,
      nextInvoiceDate: true,
      customer: { select: { name: true, email: true } },
      plan: { select: { name: true, price: true, billingPeriod: true } },
      lines: { select: { quantity: true, unitPrice: true, tax: { select: { rate: true } } } },
    },
  });

  // A tab is a status, "requests" or null for All. Leaving it out keeps the current one.
  type TabKey = SubscriptionStatus | "requests" | null;
  const current: TabKey = requestsOnly ? "requests" : (status ?? null);
  const href = (next: { tab?: TabKey; page?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    const tab = next.tab === undefined ? current : next.tab;
    if (tab === "requests") sp.set("view", "requests");
    else if (tab) sp.set("status", tab.toLowerCase());
    if (next.page && next.page > 1) sp.set("page", String(next.page));
    const qs = sp.toString();
    return qs ? `/dashboard/subscriptions?${qs}` : "/dashboard/subscriptions";
  };

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: null, label: "All", count: allCount },
    { key: "requests", label: "Customer requests", count: requestCount },
    ...SUBSCRIPTION_STATUSES.map((s) => ({ key: s, label: STATUS_INFO[s].label, count: countByStatus.get(s) ?? 0 })),
  ];
  const filtered = Boolean(q || current);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Every quotation and running subscription, from draft to closed."
        actions={<ButtonLink href="/dashboard/subscriptions/new">New subscription</ButtonLink>}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Filter by status"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-muted p-1 text-sm animate-in fade-in duration-500"
        >
          {tabs.map((tab) => {
            const active = tab.key === current;
            return (
              <Link
                key={tab.label}
                href={href({ tab: tab.key, page: 1 })}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 font-medium text-foreground/60 transition-all hover:text-foreground",
                  active && "bg-card text-foreground shadow-xs ring-1 ring-border/60",
                )}
              >
                {tab.label}
                <span className="rounded-full bg-foreground/5 px-1.5 text-xs tabular-nums text-muted-foreground">
                  {tab.count}
                </span>
              </Link>
            );
          })}
        </nav>

        <Form action="/dashboard/subscriptions" className="flex items-center gap-2">
          {status && <input type="hidden" name="status" value={status.toLowerCase()} />}
          {requestsOnly && <input type="hidden" name="view" value="requests" />}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              name="q"
              type="search"
              placeholder="Number, customer name or email…"
              defaultValue={q}
              className="w-72 pl-8"
              aria-label="Search subscriptions"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {filtered && (
            <ButtonLink href="/dashboard/subscriptions" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </Form>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState
          message={
            requestsOnly && !q
              ? "No quotation requests waiting. Requests customers send from the portal show up here."
              : filtered
                ? "No subscriptions match your filters."
                : "No subscriptions yet. Use “New subscription” to create one, from scratch or from a quotation template."
          }
        />
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
                <Th className="text-right">Recurring total</Th>
              </tr>
            </thead>
            <tbody>
              {subscriptions.map((sub) => {
                const totals = subscriptionTotals(
                  sub.plan.price,
                  sub.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate })),
                );
                return (
                  <tr key={sub.id} className="transition-colors hover:bg-muted/40">
                    <Td>
                      <Link
                        href={`/dashboard/subscriptions/${sub.id}`}
                        className="font-medium tabular-nums underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                      >
                        {sub.number}
                      </Link>
                    </Td>
                    <Td>
                      <div className="font-medium">{sub.customer.name}</div>
                      <div className="text-xs text-muted-foreground">{sub.customer.email}</div>
                    </Td>
                    <Td>{sub.plan.name}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <StatusBadge status={sub.status} />
                        {isOpenRequest(sub) && <Badge tone="amber">Customer request</Badge>}
                      </div>
                    </Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDay(sub.startDate)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDay(sub.expiryDate)}</Td>
                    <Td className="whitespace-nowrap tabular-nums">
                      {sub.status === "CLOSED" ? "—" : formatDay(sub.nextInvoiceDate)}
                    </Td>
                    <Td className="whitespace-nowrap text-right tabular-nums">
                      {formatMoney(totals.total)}
                      <span className="text-muted-foreground"> / {PERIOD_UNIT[sub.plan.billingPeriod]}</span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + subscriptions.length} of {total}
              <span className="ml-2 text-xs">· Totals include tax, before discounts.</span>
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
