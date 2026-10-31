import { requireCustomer } from "@/lib/auth";
import { Card, PageHeader } from "@/components/kit";

export default async function PortalHome() {
  const user = await requireCustomer();

  return (
    <>
      <PageHeader title={`Hello, ${user.name.split(" ")[0]}`} description="Your subscriptions and invoices." />
      <Card>
        <p className="text-sm text-slate-500">Your subscriptions and invoices will appear here.</p>
      </Card>
    </>
  );
}
