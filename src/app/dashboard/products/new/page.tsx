import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/kit";
import { ProductForm } from "../product-form";
import { taxOptions } from "../tax-options";

export default async function NewProductPage() {
  await requireAdmin();
  const taxes = await taxOptions();

  return (
    <div className="max-w-3xl">
      <PageHeader title="New product" description="Add a product to the catalog." />
      <ProductForm
        taxes={taxes}
        initial={{ name: "", type: "SOFTWARE", salesPrice: "", costPrice: "", notes: "", taxId: "", active: true }}
      />
    </div>
  );
}
