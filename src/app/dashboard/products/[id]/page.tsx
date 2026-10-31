import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, toNumber } from "@/lib/money";
import { productTypeInfo } from "@/lib/catalog/product-types";
import { Badge, Button, ButtonLink, Card, PageHeader } from "@/components/kit";
import { setProductActive } from "../actions";
import { ProductForm } from "../product-form";
import { taxLabel, taxOptions } from "../tax-options";
import { VariantsCard, type VariantRow } from "./variants-card";

export default async function ProductPage({ params }: PageProps<"/dashboard/products/[id]">) {
  const user = await requireTeam();
  const isAdmin = user.role === "ADMIN";

  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id)) notFound();

  const product = await db.product.findUnique({
    where: { id },
    include: {
      tax: { select: { name: true, rate: true } },
      variants: {
        orderBy: [{ attribute: "asc" }, { extraPrice: "asc" }, { value: "asc" }],
        include: { _count: { select: { subscriptionLines: true, templateLines: true } } },
      },
    },
  });
  if (!product) notFound();

  const variants: VariantRow[] = product.variants.map((v) => ({
    id: v.id,
    attribute: v.attribute,
    value: v.value,
    extraPrice: toNumber(v.extraPrice),
    subscriptionLines: v._count.subscriptionLines,
    templateLines: v._count.templateLines,
  }));

  const type = productTypeInfo(product.type);

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={product.name}
        description={isAdmin ? "Edit product details." : "Product details. View only."}
        actions={
          <>
            <ButtonLink href="/dashboard/products" variant="secondary">
              Back to products
            </ButtonLink>
            {isAdmin && (
              <form action={setProductActive}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="active" value={product.active ? "false" : "true"} />
                <Button type="submit" variant={product.active ? "danger" : "primary"}>
                  {product.active ? "Deactivate" : "Activate"}
                </Button>
              </form>
            )}
          </>
        }
      />

      {!product.active && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          This product is inactive. It stays on existing subscriptions and invoices but can&apos;t be added to new ones.
        </p>
      )}

      {isAdmin ? (
        <ProductForm
          productId={product.id}
          taxes={await taxOptions(product.taxId)}
          initial={{
            name: product.name,
            type: product.type,
            salesPrice: toNumber(product.salesPrice).toFixed(2),
            costPrice: toNumber(product.costPrice).toFixed(2),
            notes: product.notes ?? "",
            taxId: product.taxId ? String(product.taxId) : "",
            active: product.active,
          }}
        />
      ) : (
        <Card>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <Detail label="Type">
              <Badge tone={type.tone}>{type.label}</Badge>
            </Detail>
            <Detail label="Status">
              {product.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
            </Detail>
            <Detail label="Sales price">{formatMoney(product.salesPrice)}</Detail>
            <Detail label="Cost price">{formatMoney(product.costPrice)}</Detail>
            <Detail label="Default tax">{product.tax ? taxLabel(product.tax) : "No tax"}</Detail>
            <Detail label="Last updated">{formatDate(product.updatedAt)}</Detail>
            <div className="sm:col-span-2">
              <Detail label="Notes">
                <span className="whitespace-pre-line">{product.notes || "—"}</span>
              </Detail>
            </div>
          </dl>
        </Card>
      )}

      <VariantsCard
        productId={product.id}
        salesPrice={toNumber(product.salesPrice)}
        variants={variants}
        isAdmin={isAdmin}
      />
    </div>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-900">{children}</dd>
    </div>
  );
}
