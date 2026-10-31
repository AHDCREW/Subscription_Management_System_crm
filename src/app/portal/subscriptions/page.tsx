import { requireCustomer } from "@/lib/auth";
import { ButtonLink, EmptyState, PageHeader } from "@/components/kit";
import { NO_SUBSCRIPTIONS, getCustomerSubscriptions } from "./data";
import { SubscriptionsTable } from "./subscriptions-table";

export default async function PortalSubscriptionsPage() {
  const user = await requireCustomer();
  const subscriptions = await getCustomerSubscriptions(user.id);

  return (
    <>
      <PageHeader title="Subscriptions" description="Your quotations and subscriptions with Brightloop." />
      {subscriptions.length === 0 ? (
        <EmptyState message={NO_SUBSCRIPTIONS} action={<ButtonLink href="/portal/products/request">Request a quotation</ButtonLink>} />
      ) : (
        <SubscriptionsTable subscriptions={subscriptions} />
      )}
    </>
  );
}
