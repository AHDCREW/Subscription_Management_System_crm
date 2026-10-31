import Link from "next/link";
import Form from "next/form";
import type { Prisma } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { APPROVED_CUSTOMERS, PENDING_CUSTOMERS } from "@/lib/account-approval";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Table, Td, Th, cx } from "@/components/kit";
import { ApprovalButtons } from "./approval-buttons";

const PAGE_SIZE = 25;

type Tab = "pending" | "approved";

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function CustomersPage({ searchParams }: PageProps<"/dashboard/customers">) {
  await requireTeam();

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 120);
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  // MySQL's default collation makes `contains` case-insensitive.
  const search: Prisma.UserWhereInput = q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] } : {};

  const [pendingCount, approvedCount] = await Promise.all([
    db.user.count({ where: { ...PENDING_CUSTOMERS, ...search } }),
    db.user.count({ where: { ...APPROVED_CUSTOMERS, ...search } }),
  ]);

  // The approval queue opens by default while anyone is waiting.
  const tabParam = first(params.tab);
  const tab: Tab = tabParam === "pending" || tabParam === "approved" ? tabParam : pendingCount > 0 ? "pending" : "approved";
  const total = tab === "pending" ? pendingCount : approvedCount;

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const customers = await db.user.findMany({
    where: { ...(tab === "pending" ? PENDING_CUSTOMERS : APPROVED_CUSTOMERS), ...search },
    // Oldest signup first, so nobody waits at the bottom of the queue.
    orderBy: tab === "pending" ? [{ createdAt: "asc" }, { id: "asc" }] : [{ approvedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      createdAt: true,
      approvedAt: true,
      approvedBy: { select: { name: true } },
      _count: { select: { subscriptions: true } },
    },
  });

  const href = (opts: { tab: Tab; page?: number }) => {
    const sp = new URLSearchParams({ tab: opts.tab });
    if (q) sp.set("q", q);
    if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
    return `/dashboard/customers?${sp}`;
  };
  const tabs: { value: Tab; label: string; count: number }[] = [
    { value: "pending", label: "Waiting for approval", count: pendingCount },
    { value: "approved", label: "Approved", count: approvedCount },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customers sign up themselves. Approve them here before they can log in and be billed."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Link-based tabs: each filter is its own URL, so it survives reloads and sharing. */}
        <nav aria-label="Filter by approval" className="inline-flex h-10 items-center rounded-xl bg-muted p-1 text-muted-foreground">
          {tabs.map((t) => {
            const active = t.value === tab;
            return (
              <Link
                key={t.value}
                href={href({ tab: t.value })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-card text-foreground shadow-xs ring-1 ring-border/60" : "text-foreground/60 hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cx("text-xs tabular-nums", t.value === "pending" && t.count > 0 ? "text-warning" : "text-muted-foreground")}>
                  {t.count}
                </span>
              </Link>
            );
          })}
        </nav>

        <Form action="/dashboard/customers" className="flex items-center gap-2">
          <input type="hidden" name="tab" value={tab} />
          <Input
            name="q"
            type="search"
            placeholder="Search name, email or company…"
            defaultValue={q}
            className="w-64"
            aria-label="Search by name, email or company"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <ButtonLink href={`/dashboard/customers?tab=${tab}`} variant="ghost">
              Clear
            </ButtonLink>
          )}
        </Form>
      </div>

      {customers.length === 0 ? (
        <EmptyState
          message={
            q
              ? "No customers match your search."
              : tab === "pending"
                ? "Nobody is waiting for approval. New signups show up here."
                : "No approved customers yet."
          }
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Company</Th>
                {tab === "pending" ? (
                  <>
                    <Th>Signed up</Th>
                    <Th className="w-0">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </>
                ) : (
                  <>
                    <Th>Approved</Th>
                    <Th>Approved by</Th>
                    <Th className="text-right">Subscriptions</Th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
                <tr key={customer.id} className="hover:bg-muted/50">
                  <Td className="font-medium">{customer.name}</Td>
                  <Td className="text-muted-foreground">{customer.email}</Td>
                  <Td>{customer.company || <span className="text-muted-foreground/60">—</span>}</Td>
                  {tab === "pending" ? (
                    <>
                      <Td className="whitespace-nowrap tabular-nums">{formatDay(customer.createdAt)}</Td>
                      <Td className="py-1.5 text-right">
                        <ApprovalButtons userId={customer.id} name={customer.name} />
                      </Td>
                    </>
                  ) : (
                    <>
                      <Td className="whitespace-nowrap tabular-nums">
                        {customer.approvedAt ? formatDay(customer.approvedAt) : <span className="text-muted-foreground/60">—</span>}
                      </Td>
                      <Td>{customer.approvedBy?.name ?? <span className="text-muted-foreground/60">—</span>}</Td>
                      <Td className="text-right">
                        <Badge>{customer._count.subscriptions}</Badge>
                      </Td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + customers.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={href({ tab, page: page - 1 })} variant="secondary">
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
                  <ButtonLink href={href({ tab, page: page + 1 })} variant="secondary">
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
