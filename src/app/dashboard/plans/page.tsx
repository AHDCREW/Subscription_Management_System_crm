import Link from "next/link";
import Form from "next/form";
import type { Prisma } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { todayUtc } from "@/lib/subscriptions/subscriptions";
import { BILLING_PERIODS, PLANS_PAGE_SIZE, PLAN_FLAGS, availabilityLabel, isBillingPeriod } from "@/lib/catalog/plan-options";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Select, Table, Td, Th } from "@/components/kit";

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function PlansPage({ searchParams }: PageProps<"/dashboard/plans">) {
  const user = await requireTeam();
  const isAdmin = user.role === "ADMIN";

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 120);
  const period = first(params.period);
  const periodFilter = isBillingPeriod(period) ? period : undefined;
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  // MySQL's default collation makes `contains` case-insensitive.
  const where: Prisma.PlanWhereInput = {
    ...(q && { name: { contains: q } }),
    ...(periodFilter && { billingPeriod: periodFilter }),
  };

  const total = await db.plan.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / PLANS_PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const plans = await db.plan.findMany({
    where,
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    skip: (page - 1) * PLANS_PAGE_SIZE,
    take: PLANS_PAGE_SIZE,
    include: { _count: { select: { subscriptions: true } } },
  });

  const today = todayUtc();
  const filtered = Boolean(q || periodFilter);
  const pageHref = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (periodFilter) sp.set("period", periodFilter);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return qs ? `/dashboard/plans?${qs}` : "/dashboard/plans";
  };

  return (
    <>
      <PageHeader
        title="Plans"
        description={
          isAdmin ? "What each subscription costs, how often it bills and when it can be sold." : "Recurring plans. View only."
        }
        actions={isAdmin && (plans.length > 0 || filtered) && <ButtonLink href="/dashboard/plans/new">New plan</ButtonLink>}
      />

      <Form action="/dashboard/plans" className="mb-4 flex flex-wrap items-center gap-2">
        <Input name="q" type="search" placeholder="Search by name…" defaultValue={q} className="w-64" aria-label="Search by name" />
        <Select name="period" defaultValue={periodFilter ?? ""} className="w-40" aria-label="Filter by billing period">
          <option value="">All periods</option>
          {BILLING_PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <ButtonLink href="/dashboard/plans" variant="ghost">
            Clear
          </ButtonLink>
        )}
      </Form>

      {plans.length === 0 ? (
        <EmptyState
          message={filtered ? "No plans match your filters." : "No plans yet."}
          action={!filtered && isAdmin ? <ButtonLink href="/dashboard/plans/new">Create your first plan</ButtonLink> : undefined}
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th className="text-right">Price</Th>
                <Th>Billing</Th>
                <Th className="text-right">Min qty</Th>
                <Th>Available</Th>
                <Th>Options</Th>
                <Th className="text-right">Subscriptions</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((plan) => {
                const ended = plan.endDate !== null && plan.endDate < today;
                const options = PLAN_FLAGS.filter((flag) => plan[flag.key]);
                return (
                  <tr key={plan.id} className="hover:bg-muted/50">
                    <Td>
                      <Link href={`/dashboard/plans/${plan.id}`} className="font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
                        {plan.name}
                      </Link>
                    </Td>
                    <Td className="text-right whitespace-nowrap tabular-nums">
                      {formatMoney(plan.price)}
                      <span className="text-muted-foreground"> / {PERIOD_UNIT[plan.billingPeriod]}</span>
                    </Td>
                    <Td>
                      <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
                    </Td>
                    <Td className="text-right tabular-nums">{plan.minQuantity}</Td>
                    <Td className="whitespace-nowrap">
                      <span className={plan.startDate || plan.endDate ? undefined : "text-muted-foreground"}>
                        {availabilityLabel(plan.startDate, plan.endDate)}
                      </span>
                      {ended && <span className="block text-xs text-muted-foreground">Ended</span>}
                    </Td>
                    <Td>
                      {options.length === 0 ? (
                        <span className="text-muted-foreground/60">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {options.map((flag) => (
                            <Badge key={flag.key} tone="outline">
                              {flag.label}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Badge>{plan._count.subscriptions}</Badge>
                    </Td>
                    <Td>{plan.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PLANS_PAGE_SIZE + 1}–{(page - 1) * PLANS_PAGE_SIZE + plans.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={pageHref(page - 1)} variant="secondary">
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
                  <ButtonLink href={pageHref(page + 1)} variant="secondary">
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
