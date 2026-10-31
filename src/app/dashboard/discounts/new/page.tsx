import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/kit";
import { DiscountForm } from "../discount-form";

export default async function NewDiscountPage() {
  await requireAdmin();
  const products = await db.product.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, active: true },
  });

  return (
    <div className="max-w-3xl">
      <PageHeader title="New discount" description="A fixed amount or percentage taken off invoices." />
      <DiscountForm
        products={products}
        initial={{
          name: "",
          type: "PERCENTAGE",
          value: "",
          scope: "SUBSCRIPTION",
          productIds: [],
          minPurchase: "",
          minQuantity: "",
          startDate: "",
          endDate: "",
          usageLimit: "",
          active: true,
        }}
      />
    </div>
  );
}
