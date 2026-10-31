import { requireTeam } from "@/lib/auth";
import { ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { getTemplateFormOptions } from "../data";
import { TemplateForm } from "../template-form";

export default async function NewTemplatePage() {
  await requireTeam();
  const { plans, products } = await getTemplateFormOptions();

  return (
    <>
      <PageHeader
        title="New quotation template"
        description="Pick a plan, add the product lines and set how many days a quotation stays valid."
      />
      {plans.length === 0 ? (
        <EmptyState
          message="There are no active plans yet. A template needs a plan, so create one first."
          action={<ButtonLink href="/dashboard/plans">Go to plans</ButtonLink>}
        />
      ) : products.length === 0 ? (
        <EmptyState
          message="There are no active products yet. Add the products you sell first."
          action={<ButtonLink href="/dashboard/products">Go to products</ButtonLink>}
        />
      ) : (
        <TemplateForm
          plans={plans}
          products={products}
          initial={{
            name: "",
            planId: plans.length === 1 ? plans[0].id : null,
            validityDays: 30,
            notes: "",
            lines: [],
          }}
        />
      )}
    </>
  );
}
