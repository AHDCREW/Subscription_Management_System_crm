import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT, estimateRecurringTotal } from "@/lib/subscriptions/templates";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/kit";

export default async function TemplatesPage() {
  await requireTeam();

  const [templates, activePlans, activeProducts] = await Promise.all([
    db.quotationTemplate.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        validityDays: true,
        plan: { select: { name: true, price: true, billingPeriod: true, active: true } },
        lines: {
          select: {
            quantity: true,
            product: { select: { salesPrice: true } },
            variant: { select: { extraPrice: true } },
          },
        },
        _count: { select: { subscriptions: true } },
      },
    }),
    db.plan.count({ where: { active: true } }),
    db.product.count({ where: { active: true } }),
  ]);

  const header = (
    <PageHeader
      title="Quotation templates"
      description="Reusable starting points for quotations: a plan, its product lines and how long the quote stays valid."
      actions={templates.length > 0 && <ButtonLink href="/dashboard/templates/new">New template</ButtonLink>}
    />
  );

  if (templates.length === 0) {
    return (
      <>
        {header}
        {activePlans === 0 ? (
          <EmptyState
            message="Templates are built on a plan. Create an active plan first, then come back here."
            action={<ButtonLink href="/dashboard/plans">Go to plans</ButtonLink>}
          />
        ) : activeProducts === 0 ? (
          <EmptyState
            message="Templates list the products a customer gets. Add an active product first, then come back here."
            action={<ButtonLink href="/dashboard/products">Go to products</ButtonLink>}
          />
        ) : (
          <EmptyState
            message="No quotation templates yet. Create one so sales reps can start quotes in a click."
            action={<ButtonLink href="/dashboard/templates/new">New template</ButtonLink>}
          />
        )}
      </>
    );
  }

  return (
    <>
      {header}
      <Table>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Plan</Th>
            <Th className="text-right">Lines</Th>
            <Th className="text-right">Valid for</Th>
            <Th className="text-right">Est. recurring total</Th>
            <Th className="text-right">Used by</Th>
            <Th>
              <span className="sr-only">Actions</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {templates.map((template) => {
            const total = estimateRecurringTotal(
              template.plan.price,
              template.lines.map((line) => ({
                quantity: line.quantity,
                salesPrice: line.product.salesPrice,
                extraPrice: line.variant?.extraPrice,
              })),
            );
            const used = template._count.subscriptions;
            return (
              <tr key={template.id} className="hover:bg-slate-50">
                <Td>
                  <Link
                    href={`/dashboard/templates/${template.id}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {template.name}
                  </Link>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{template.plan.name}</span>
                    <Badge tone="indigo">{PERIOD_LABEL[template.plan.billingPeriod]}</Badge>
                    {!template.plan.active && <Badge tone="amber">Plan inactive</Badge>}
                  </div>
                </Td>
                <Td className="text-right tabular-nums">{template.lines.length}</Td>
                <Td className="text-right tabular-nums">
                  {template.validityDays} day{template.validityDays === 1 ? "" : "s"}
                </Td>
                <Td className="text-right tabular-nums">
                  {formatMoney(total)}
                  <span className="text-slate-500"> / {PERIOD_UNIT[template.plan.billingPeriod]}</span>
                </Td>
                <Td className="text-right tabular-nums">
                  {used} subscription{used === 1 ? "" : "s"}
                </Td>
                <Td className="text-right">
                  <Link href={`/dashboard/templates/${template.id}`} className="text-indigo-600 hover:underline">
                    Edit
                  </Link>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-slate-500">
        Estimated total = plan price (base fee) + quantity × (product price + variant extra) for each line, before tax and
        discounts.
      </p>
    </>
  );
}
