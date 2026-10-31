import Link from "next/link";
import Form from "next/form";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { Badge, Button, ButtonLink, EmptyState, Input, PageHeader, Table, Td, Th, cx, type BadgeTone } from "@/components/kit";
import { AddStaffDialog } from "./add-staff-dialog";
import { RoleButton } from "./role-button";

const PAGE_SIZE = 25;

// This page is the Brightloop team only. Customers live on /dashboard/customers.
type TeamRole = Exclude<Role, "CUSTOMER">;
const ROLE_INFO: Record<TeamRole, { label: string; tone: BadgeTone; param: string }> = {
  ADMIN: { label: "Admin", tone: "indigo", param: "admin" },
  STAFF: { label: "Staff", tone: "blue", param: "staff" },
};
const ROLES = Object.keys(ROLE_INFO) as TeamRole[];

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function StaffPage({ searchParams }: PageProps<"/dashboard/users">) {
  const me = await requireAdmin();

  const params = await searchParams;
  const q = first(params.q).trim().slice(0, 120);
  const roleParam = first(params.role).toLowerCase();
  // Old links to the customer filter now go to the Customers page.
  if (roleParam === "customer") redirect(q ? `/dashboard/customers?q=${encodeURIComponent(q)}` : "/dashboard/customers");
  const role = ROLES.find((r) => ROLE_INFO[r].param === roleParam);
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  // MySQL's default collation makes `contains` case-insensitive.
  const search: Prisma.UserWhereInput = {
    role: { in: ROLES },
    ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }] }),
  };
  const where: Prisma.UserWhereInput = { ...search, ...(role && { role }) };

  const [total, roleCounts] = await Promise.all([
    db.user.count({ where }),
    db.user.groupBy({ by: ["role"], where: search, _count: { _all: true } }),
  ]);
  const countFor = (r?: TeamRole) =>
    roleCounts.filter((row) => !r || row.role === r).reduce((sum, row) => sum + row._count._all, 0);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const users = await db.user.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      approvedBy: { select: { name: true } },
    },
  });

  const href = (opts: { role?: TeamRole; page?: number }) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (opts.role) sp.set("role", ROLE_INFO[opts.role].param);
    if (opts.page && opts.page > 1) sp.set("page", String(opts.page));
    const qs = sp.toString();
    return qs ? `/dashboard/users?${qs}` : "/dashboard/users";
  };
  const tabs: { value: string; label: string; role?: TeamRole }[] = [
    { value: "all", label: "All team" },
    ...ROLES.map((r) => ({ value: ROLE_INFO[r].param, label: ROLE_INFO[r].label, role: r })),
  ];

  return (
    <>
      <PageHeader
        title="Staff"
        description="Your Brightloop team. Admins control everything; staff handle day-to-day work. Only admins can add staff."
        actions={
          <>
            <ButtonLink href="/dashboard/customers" variant="secondary">
              View customers
            </ButtonLink>
            <AddStaffDialog />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Link-based tabs: each role filter is its own URL, so it survives reloads and sharing. */}
        <nav aria-label="Filter by role" className="inline-flex h-10 items-center rounded-xl bg-muted p-1 text-muted-foreground">
          {tabs.map((tab) => {
            const active = tab.role === role;
            return (
              <Link
                key={tab.value}
                href={href({ role: tab.role })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-full items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-all",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active ? "bg-card text-foreground shadow-xs ring-1 ring-border/60" : "text-foreground/60 hover:text-foreground",
                )}
              >
                {tab.label}
                <span className="text-xs tabular-nums text-muted-foreground">{countFor(tab.role)}</span>
              </Link>
            );
          })}
        </nav>

        <Form action="/dashboard/users" className="flex items-center gap-2">
          {role && <input type="hidden" name="role" value={ROLE_INFO[role].param} />}
          <Input
            name="q"
            type="search"
            placeholder="Search name or email…"
            defaultValue={q}
            className="w-64"
            aria-label="Search by name or email"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {q && (
            <ButtonLink href={href({ role })} variant="ghost">
              Clear
            </ButtonLink>
          )}
        </Form>
      </div>

      {users.length === 0 ? (
        <EmptyState message={q ? "No team members match your search." : "No team members with this role yet."} />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Added by</Th>
                <Th>Joined</Th>
                <Th className="w-0">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const teamRole = user.role as TeamRole; // the query only returns team roles
                const info = ROLE_INFO[teamRole];
                const isMe = user.id === me.id;
                return (
                  <tr key={user.id} className="hover:bg-muted/50">
                    <Td className="font-medium">
                      {user.name}
                      {isMe && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                    </Td>
                    <Td className="text-muted-foreground">{user.email}</Td>
                    <Td>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </Td>
                    <Td>{user.approvedBy?.name ?? <span className="text-muted-foreground/60">—</span>}</Td>
                    <Td className="whitespace-nowrap tabular-nums">{formatDay(user.createdAt)}</Td>
                    <Td className="py-1.5 text-right">
                      {!isMe && <RoleButton userId={user.id} name={user.name} role={teamRole} />}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + users.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={href({ role, page: page - 1 })} variant="secondary">
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
                  <ButtonLink href={href({ role, page: page + 1 })} variant="secondary">
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
