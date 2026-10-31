import { requireTeam } from "@/lib/auth";
import { ButtonLink, EmptyState, PageHeader } from "@/components/kit";
import { toDateInput, todayUtc } from "@/lib/subscriptions/subscriptions";
import { getInitialCustomers, getSubscriptionFormOptions } from "../data";
import { SubscriptionForm } from "../subscription-form";

export default async function NewSubscriptionPage() {
  await requireTeam();
  const [options, customers] = await Promise.all([getSubscriptionFormOptions(), getInitialCustomers()]);
  const today = toDateInput(todayUtc());

  return (
    <>
      <PageHeader
        title="New subscription"
        description="Saved as a draft. Start from a quotation template or build it line by line."
      />
      {options.plans.length === 0 ? (
        <EmptyState
          message="There are no active plans yet. A subscription needs a plan, so create one first."
          action={<ButtonLink href="/dashboard/plans">Go to plans</ButtonLink>}
        />
      ) : options.products.length === 0 ? (
        <EmptyState
          message="There are no active products yet. Add the products you sell first."
          action={<ButtonLink href="/dashboard/products">Go to products</ButtonLink>}
        />
      ) : (
        <SubscriptionForm
          options={options}
          initialCustomers={customers}
          today={today}
          initial={{
            customer: null,
            planId: null,
            templateId: null,
            startDate: today,
            expiryDate: "",
            paymentTermDays: 0,
            notes: "",
            lines: [],
          }}
        />
      )}
    </>
  );
}
