import Link from "next/link";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { toUtcDate } from "@/lib/billing";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { ButtonLink, EmptyState, PageHeader, SectionHeader } from "@/components/kit";
import { FadeIn, StatCard } from "@/components/motion";
import { NO_SUBSCRIPTIONS, customerSubscriptionsWhere, getCustomerSubscriptions, getNextBill, recurringTotal } from "./subscriptions/data";
import { SubscriptionsTable } from "./subscriptions/subscriptions-table";

const RECENT_COUNT = 5;

export default async function PortalHome() {
  const user = await requireCustomer();
  const today = toUtcDate(new Date());

  // Unpaid = confirmed and not fully paid; overdue = unpaid and due before today.
  const unpaidWhere = { customerId: user.id, status: "CONFIRMED" as const, amountPaid: { lt: db.invoice.fields.total } };

  const [activeCount, nextBill, unpaidCount, overdueCount, totalCount, recent] = await Promise.all([
    db.subscription.count({ where: { customerId: user.id, status: "ACTIVE" } }),
    getNextBill(user.id),
    db.invoice.count({ where: unpaidWhere }),
    db.invoice.count({ where: { ...unpaidWhere, dueDate: { lt: today } } }),
    db.subscription.count({ where: customerSubscriptionsWhere(user.id) }),
    getCustomerSubscriptions(user.id, RECENT_COUNT),
  ]);

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Your subscriptions and invoices." />

      <FadeIn className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Active subscriptions" value={activeCount} />
        <StatCard
          label="Next bill"
          value={nextBill ? recurringTotal(nextBill) : 0}
          prefix="₹"
          decimals={2}
          hint={nextBill ? `On ${formatDay(nextBill.nextInvoiceDate)} · ${nextBill.number}` : "No upcoming bills"}
        />
        <StatCard
          label="Unpaid invoices"
          value={unpaidCount}
          hint={
            overdueCount > 0 ? (
              <span className="text-destructive">{overdueCount} overdue</span>
            ) : unpaidCount > 0 ? (
              "None overdue"
            ) : (
              "All paid up"
            )
          }
        />
      </FadeIn>

      <SectionHeader
        title="Your subscriptions"
        description={totalCount > RECENT_COUNT ? `Latest ${RECENT_COUNT} of ${totalCount}` : undefined}
        actions={
          totalCount > 0 && (
            <Link
              href="/portal/subscriptions"
              className="text-sm underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
            >
              View all
            </Link>
          )
        }
      />
      {recent.length === 0 ? (
        <EmptyState message={NO_SUBSCRIPTIONS} action={<ButtonLink href="/portal/products/request">Request a quotation</ButtonLink>} />
      ) : (
        <SubscriptionsTable subscriptions={recent} />
      )}
    </>
  );
}
