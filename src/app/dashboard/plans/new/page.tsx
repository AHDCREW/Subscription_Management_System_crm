import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/kit";
import { PlanForm } from "../plan-form";

export default async function NewPlanPage() {
  await requireAdmin();

  return (
    <div className="max-w-3xl">
      <PageHeader title="New plan" description="Set what it costs, how often it bills and when it can be sold." />
      <PlanForm
        initial={{
          name: "",
          price: "",
          billingPeriod: "MONTHLY",
          minQuantity: "1",
          startDate: "",
          endDate: "",
          autoClose: false,
          closable: true,
          pausable: true,
          renewable: true,
          active: true,
        }}
      />
    </div>
  );
}
