import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { STATUS_INFO, isEditableStatus, toDateInput, todayUtc } from "@/lib/subscriptions/subscriptions";
import { Alert, ButtonLink, EmptyState, PageHeader } from "@/components/kit";
import { customerSelect, getInitialCustomers, getSubscriptionFormOptions } from "../../data";
import { SubscriptionForm } from "../../subscription-form";

export default async function EditSubscriptionPage({ params }: PageProps<"/dashboard/subscriptions/[id]/edit">) {
  await requireTeam();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const sub = await db.subscription.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      planId: true,
      templateId: true,
      startDate: true,
      expiryDate: true,
      paymentTermDays: true,
      notes: true,
      customer: { select: customerSelect },
      plan: { select: { name: true, active: true } },
      lines: {
        orderBy: { id: "asc" },
        select: {
          productId: true,
          variantId: true,
          quantity: true,
          unitPrice: true,
          taxId: true,
          product: { select: { name: true, active: true } },
        },
      },
    },
  });
  if (!sub) notFound();

  if (!isEditableStatus(sub.status)) {
    return (
      <>
        <PageHeader title={`Edit ${sub.number}`} />
        <EmptyState
          message={`${sub.number} is ${STATUS_INFO[sub.status].label.toLowerCase()}. Only drafts and quotations can be edited.`}
          action={
            <ButtonLink href={`/dashboard/subscriptions/${sub.id}`} variant="ghost">
              Back to subscription
            </ButtonLink>
          }
        />
      </>
    );
  }

  const keepTaxIds = [...new Set(sub.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))];
  const [options, customers] = await Promise.all([getSubscriptionFormOptions(keepTaxIds), getInitialCustomers()]);
  const inactiveProducts = [...new Set(sub.lines.filter((l) => !l.product.active).map((l) => l.product.name))];

  return (
    <>
      <PageHeader title={`Edit ${sub.number}`} description="Lines and terms can change until the quotation is confirmed." />

      {(!sub.plan.active || inactiveProducts.length > 0) && (
        <div className="mb-6 space-y-2">
          {!sub.plan.active && <Alert>The plan “{sub.plan.name}” is inactive. Choose an active plan before saving.</Alert>}
          {inactiveProducts.length > 0 && (
            <Alert>
              Inactive product{inactiveProducts.length === 1 ? "" : "s"} on this subscription: {inactiveProducts.join(", ")}.
              Replace or remove {inactiveProducts.length === 1 ? "it" : "them"} before saving.
            </Alert>
          )}
        </div>
      )}

      <SubscriptionForm
        key={sub.id}
        options={options}
        initialCustomers={customers}
        today={toDateInput(todayUtc())}
        initial={{
          id: sub.id,
          number: sub.number,
          customer: sub.customer,
          planId: sub.planId,
          templateId: sub.templateId,
          startDate: toDateInput(sub.startDate),
          expiryDate: toDateInput(sub.expiryDate),
          paymentTermDays: sub.paymentTermDays,
          notes: sub.notes ?? "",
          lines: sub.lines.map((line) => ({
            productId: line.productId,
            variantId: line.variantId,
            quantity: line.quantity,
            unitPrice: toNumber(line.unitPrice),
            taxId: line.taxId,
          })),
        }}
      />
    </>
  );
}
