import { requireTeam } from "@/lib/auth";
import { Card, PageHeader } from "@/components/ui";

export default async function DashboardPage() {
  const user = await requireTeam();

  return (
    <>
      <PageHeader title={`Welcome, ${user.name.split(" ")[0]}`} description="Brightloop Software at a glance." />
      <Card>
        <p className="text-sm text-slate-500">Summary cards and revenue chart are coming here.</p>
      </Card>
    </>
  );
}
