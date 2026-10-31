import Link from "next/link";
import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney, toNumber } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { STATUS_INFO, formatDay, toDateInput } from "@/lib/subscriptions/subscriptions";
import { PLAN_FLAGS, availabilityLabel } from "@/lib/catalog/plan-options";
import { Badge, Button, ButtonLink, Card, DetailItem, PageHeader, SectionHeader, Table, Td, Th } from "@/components/kit";
import { setPlanActive } from "../actions";
import { PlanForm } from "../plan-form";
import { DeletePlan } from "./delete-plan";

const RECENT_SUBSCRIPTIONS = 10;

export default async function PlanPage({ params }: PageProps<"/dashboard/plans/[id]">) {
  const user = await requireTeam();
  const isAdmin = user.role === "ADMIN";

  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id)) notFound();

  const plan = await db.plan.findUnique({
    where: { id },
    include: {
      _count: { select: { subscriptions: true, templates: true } },
      subscriptions: {
        orderBy: { id: "desc" },
        take: RECENT_SUBSCRIPTIONS,
        select: { id: true, number: true, status: true, customer: { select: { name: true } } },
      },
    },
  });
  if (!plan) notFound();

  const subscriptions = plan._count.subscriptions;
  const templates = plan._count.templates;
  const unused = subscriptions === 0 && templates === 0;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={plan.name}
        description={isAdmin ? "Edit plan details and options." : "Plan details. View only."}
        actions={
          <>
            <ButtonLink href="/dashboard/plans" variant="ghost">
              Back to plans
            </ButtonLink>
            {isAdmin && unused && <DeletePlan planId={plan.id} planName={plan.name} />}
            {isAdmin && (
              <form action={setPlanActive}>
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="active" value={plan.active ? "false" : "true"} />
                <Button type="submit" variant="secondary">
                  {plan.active ? "Deactivate" : "Activate"}
                </Button>
              </form>
            )}
          </>
        }
      />

      {!plan.active && (
        <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
          This plan is inactive. Existing subscriptions keep it, but it can&apos;t be chosen for new ones.
        </p>
      )}

      {isAdmin ? (
        <PlanForm
          planId={plan.id}
          usedBy={subscriptions}
          initial={{
            name: plan.name,
            price: toNumber(plan.price).toFixed(2),
            billingPeriod: plan.billingPeriod,
            minQuantity: String(plan.minQuantity),
            startDate: toDateInput(plan.startDate),
            endDate: toDateInput(plan.endDate),
            autoClose: plan.autoClose,
            closable: plan.closable,
            pausable: plan.pausable,
            renewable: plan.renewable,
            active: plan.active,
          }}
        />
      ) : (
        <Card>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <DetailItem label="Price">
              <span className="tabular-nums">{formatMoney(plan.price)}</span>
              <span className="text-muted-foreground"> / {PERIOD_UNIT[plan.billingPeriod]}</span>
            </DetailItem>
            <DetailItem label="Billing period">
              <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
            </DetailItem>
            <DetailItem label="Minimum quantity">{plan.minQuantity}</DetailItem>
            <DetailItem label="Status">{plan.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</DetailItem>
            <DetailItem label="Available">{availabilityLabel(plan.startDate, plan.endDate)}</DetailItem>
            <DetailItem label="Created">{formatDay(plan.createdAt)}</DetailItem>
          </dl>
          <div className="mt-6 border-t pt-6">
            <SectionHeader title="Options" />
            <ul className="space-y-2">
              {PLAN_FLAGS.map((flag) => (
                <li key={flag.key} className="flex items-start gap-3 text-sm">
                  {plan[flag.key] ? <Badge tone="green">Yes</Badge> : <Badge>No</Badge>}
                  <span>
                    <span className="font-medium">{flag.label}</span>
                    <span className="block text-xs text-muted-foreground">{flag.help}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <SectionHeader
          title="Usage"
          description={
            unused
              ? "Nothing uses this plan yet."
              : `${subscriptions} ${subscriptions === 1 ? "subscription" : "subscriptions"} and ${templates} quotation ${
                  templates === 1 ? "template" : "templates"
                }. Plans in use can be deactivated, but not deleted.`
          }
        />
        {plan.subscriptions.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>Customer</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {plan.subscriptions.map((sub) => (
                <tr key={sub.id} className="hover:bg-muted/50">
                  <Td>
                    <Link href={`/dashboard/subscriptions/${sub.id}`} className="font-medium underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
                      {sub.number}
                    </Link>
                  </Td>
                  <Td>{sub.customer.name}</Td>
                  <Td>
                    <Badge tone={STATUS_INFO[sub.status].tone}>{STATUS_INFO[sub.status].label}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          !unused && <p className="text-sm text-muted-foreground">No subscriptions on this plan yet.</p>
        )}
        {subscriptions > plan.subscriptions.length && (
          <p className="mt-3 text-xs text-muted-foreground">Showing the latest {plan.subscriptions.length}.</p>
        )}
      </Card>
    </div>
  );
}
