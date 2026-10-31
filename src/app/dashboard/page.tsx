import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, PageHeader } from "@/components/kit";
import { StatCard } from "@/components/motion";

export default async function DashboardPage() {
  const user = await requireTeam();

  const [activeSubscriptions, customers, products, openInvoices] = await Promise.all([
    db.subscription.count({ where: { status: "ACTIVE" } }),
    db.user.count({ where: { role: "CUSTOMER" } }),
    db.product.count({ where: { active: true } }),
    db.invoice.count({ where: { status: "CONFIRMED" } }),
  ]);

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Brightloop Software at a glance." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active subscriptions" value={activeSubscriptions} />
        <StatCard label="Customers" value={customers} />
        <StatCard label="Active products" value={products} />
        <StatCard label="Open invoices" value={openInvoices} />
      </div>
      <Card className="mt-6">
        <p className="text-sm text-muted-foreground">Revenue chart and overdue list are coming here.</p>
      </Card>
    </>
  );
}
