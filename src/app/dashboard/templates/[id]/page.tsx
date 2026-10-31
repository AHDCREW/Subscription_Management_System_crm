import { notFound } from "next/navigation";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/money";
import { Alert, Card, PageHeader } from "@/components/kit";
import { getTemplateFormOptions } from "../data";
import { DeleteTemplateButton } from "../delete-template-button";
import { TemplateForm } from "../template-form";

export default async function EditTemplatePage({ params }: PageProps<"/dashboard/templates/[id]">) {
  await requireTeam();

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const [template, { plans, products }] = await Promise.all([
    db.quotationTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        planId: true,
        validityDays: true,
        notes: true,
        createdAt: true,
        plan: { select: { name: true, active: true } },
        lines: {
          orderBy: { id: "asc" },
          select: {
            productId: true,
            variantId: true,
            quantity: true,
            product: { select: { name: true, active: true } },
          },
        },
        _count: { select: { subscriptions: true } },
      },
    }),
    getTemplateFormOptions(),
  ]);
  if (!template) notFound();

  const inactiveProducts = [
    ...new Set(template.lines.filter((line) => !line.product.active).map((line) => line.product.name)),
  ];
  const used = template._count.subscriptions;

  return (
    <>
      <PageHeader title={template.name} description={`Quotation template · created ${formatDate(template.createdAt)}`} />

      {(!template.plan.active || inactiveProducts.length > 0) && (
        <div className="mb-6 space-y-2">
          {!template.plan.active && (
            <Alert>The plan “{template.plan.name}” is inactive. Choose an active plan before saving.</Alert>
          )}
          {inactiveProducts.length > 0 && (
            <Alert>
              Inactive product{inactiveProducts.length === 1 ? "" : "s"} on this template: {inactiveProducts.join(", ")}.
              Replace or remove {inactiveProducts.length === 1 ? "it" : "them"} before saving.
            </Alert>
          )}
        </div>
      )}

      <TemplateForm
        key={template.id}
        plans={plans}
        products={products}
        initial={{
          id: template.id,
          name: template.name,
          planId: template.planId,
          validityDays: template.validityDays,
          notes: template.notes ?? "",
          lines: template.lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
        }}
      />

      <Card className="mt-8 space-y-3">
        <h2 className="text-base font-semibold text-slate-900">Delete template</h2>
        {used > 0 ? (
          <p className="text-sm text-slate-500">
            This template is used by {used} subscription{used === 1 ? "" : "s"}, so it can&apos;t be deleted.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-500">
              No subscriptions use this template. Deleting it removes the template and its lines.
            </p>
            <DeleteTemplateButton id={template.id} name={template.name} />
          </>
        )}
      </Card>
    </>
  );
}
