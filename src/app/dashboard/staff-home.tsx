import type { ReactNode } from "react";
import Link from "next/link";
import { Plus, Wallet } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import { formatMoney, toNumber } from "@/lib/money";
import { outstandingAmount } from "@/lib/billing";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { PAYMENT_METHOD_LABEL, daysOverdue, pluralDays } from "@/lib/reports/format";
import { getStaffQueue } from "@/lib/reports/queries";
import { ButtonLink, Card, PageHeader, cx } from "@/components/kit";
import { Stagger } from "@/components/motion";

const linkClass = "underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground";

type QueueItem = { key: number; href: string; title: ReactNode; detail: ReactNode; meta: ReactNode };

// The staff home: today's work, not company revenue. Each card is a count, the
// first few items and a link to the filtered list where the work gets done.
export async function StaffHome({ user }: { user: SessionUser }) {
  const queue = await getStaffQueue();
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, queue.currency);
  const todayIso = queue.today.toISOString().slice(0, 10);
  const who = (customer: { name: string; company: string | null }) =>
    customer.company ? `${customer.name} · ${customer.company}` : customer.name;

  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(" ")[0]}`}
        description="Staff dashboard · your work queue for today."
        actions={
          <>
            <ButtonLink href="/dashboard/subscriptions/new">
              <Plus aria-hidden />
              New quotation / subscription
            </ButtonLink>
            {/* Payments are recorded on an invoice, so start from the ones awaiting payment. */}
            <ButtonLink href="/dashboard/invoices?status=confirmed" variant="secondary">
              <Wallet aria-hidden />
              Record payment
            </ButtonLink>
          </>
        }
      />

      <Stagger className="grid gap-6 lg:grid-cols-2 2xl:grid-cols-3">
        <QueueCard
          title="Customers waiting for approval"
          description="Oldest signup first."
          href="/dashboard/customers?tab=pending"
          linkLabel="Review"
          tone="warning"
          count={queue.pendingCustomers.count}
          empty="No signups waiting."
          items={queue.pendingCustomers.rows.map((c) => ({
            key: c.id,
            href: "/dashboard/customers?tab=pending",
            title: c.name,
            detail: c.company ? `${c.email} · ${c.company}` : c.email,
            meta: <span className="text-muted-foreground">Signed up {formatDay(c.createdAt)}</span>,
          }))}
        />

        <QueueCard
          title="Overdue invoices to chase"
          description="Most overdue first."
          href="/dashboard/invoices?status=overdue"
          tone="destructive"
          count={queue.overdueInvoices.count}
          empty="Nothing overdue."
          items={queue.overdueInvoices.rows.map((inv) => ({
            key: inv.id,
            href: `/dashboard/invoices/${inv.id}`,
            title: inv.number,
            detail: `${who(inv.customer)} · due ${formatDay(inv.dueDate)}`,
            meta: (
              <>
                <span className="block font-medium">{money(outstandingAmount(inv.total, inv.amountPaid))}</span>
                <span className="block text-xs text-destructive">{pluralDays(daysOverdue(inv.dueDate, queue.today))} overdue</span>
              </>
            ),
          }))}
        />

        <QueueCard
          title="Draft invoices to confirm"
          description="Confirm, then send or print. Oldest first."
          href="/dashboard/invoices?status=draft"
          count={queue.draftInvoices.count}
          empty="No draft invoices."
          items={queue.draftInvoices.rows.map((inv) => ({
            key: inv.id,
            href: `/dashboard/invoices/${inv.id}`,
            title: inv.number,
            detail: `${who(inv.customer)} · ${formatDay(inv.invoiceDate)}`,
            meta: money(inv.total),
          }))}
        />

        <QueueCard
          title="Quotations awaiting confirmation"
          description="Sent to the customer, not yet confirmed."
          href="/dashboard/subscriptions?status=quotation"
          count={queue.quotations.count}
          empty="No open quotations."
          items={queue.quotations.rows.map((sub) => ({
            key: sub.id,
            href: `/dashboard/subscriptions/${sub.id}`,
            title: sub.number,
            detail: `${who(sub.customer)} · ${sub.plan.name}`,
            meta: (
              <span className="text-muted-foreground">
                {sub.quotationExpiresAt ? `Valid until ${formatDay(sub.quotationExpiresAt)}` : "No expiry"}
              </span>
            ),
          }))}
        />

        <QueueCard
          title="Subscriptions expiring soon"
          description="Active or paused, ending in the next 14 days."
          href="/dashboard/subscriptions?status=active"
          count={queue.expiring.count}
          empty="Nothing expires in the next 14 days."
          items={queue.expiring.rows.map((sub) => {
            // Same whole-day maths as "days overdue", counted forwards. The filter guarantees an expiry date.
            const daysLeft = sub.expiryDate ? daysOverdue(queue.today, sub.expiryDate) : 0;
            return {
              key: sub.id,
              href: `/dashboard/subscriptions/${sub.id}`,
              title: sub.number,
              detail: `${who(sub.customer)} · ${sub.plan.name}`,
              meta: (
                <>
                  <span className="block">{formatDay(sub.expiryDate)}</span>
                  <span className="block text-xs text-muted-foreground">{daysLeft === 0 ? "Today" : `In ${pluralDays(daysLeft)}`}</span>
                </>
              ),
            };
          })}
        />

        <QueueCard
          title="Payments recorded today"
          description="Latest first."
          href={`/dashboard/payments?from=${todayIso}&to=${todayIso}`}
          count={queue.paymentsToday.count}
          empty="No payments recorded today yet."
          items={queue.paymentsToday.rows.map((p) => ({
            key: p.id,
            href: `/dashboard/invoices/${p.invoice.id}`,
            title: p.invoice.number,
            detail: `${p.invoice.customer.name} · ${PAYMENT_METHOD_LABEL[p.method]}`,
            meta: money(toNumber(p.amount)),
          }))}
        />
      </Stagger>
    </>
  );
}

function QueueCard({
  title,
  description,
  href,
  linkLabel = "View all",
  tone,
  count,
  empty,
  items,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel?: string;
  tone?: "warning" | "destructive";
  count: number;
  empty: string;
  items: QueueItem[];
}) {
  return (
    <Card className="flex flex-col">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cx(
              "text-3xl font-semibold tracking-tight tabular-nums",
              count > 0 && tone === "warning" && "text-warning",
              count > 0 && tone === "destructive" && "text-destructive",
            )}
          >
            {count}
          </p>
          <h2 className="mt-1 font-semibold tracking-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Link href={href} className={`shrink-0 text-sm ${linkClass}`}>
          {linkLabel}
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <Link href={item.href} className={`text-sm font-medium tabular-nums ${linkClass}`}>
                  {item.title}
                </Link>
                <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
              </div>
              <div className="shrink-0 text-right text-sm tabular-nums">{item.meta}</div>
            </li>
          ))}
        </ul>
      )}

      {count > items.length && (
        <Link href={href} className={`mt-3 text-xs text-muted-foreground ${linkClass}`}>
          and {count - items.length} more
        </Link>
      )}
    </Card>
  );
}
