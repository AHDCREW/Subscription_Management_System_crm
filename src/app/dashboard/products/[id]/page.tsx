import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, toNumber } from "@/lib/money";
import { productTypeInfo } from "@/lib/catalog/product-types";
import { Badge, Button, ButtonLink, Card, PageHeader, Table, Td, Th } from "@/components/kit";
import { setProductActive } from "../actions";
import { ProductForm } from "../product-form";
import { taxLabel, taxOptions } from "../tax-options";

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
      variants: { orderBy: [{ attribute: "asc" }, { value: "asc" }] },
    },
  });
  if (!product) notFound();

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

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Variants</h2>
          <Badge tone="gray">Variants: coming next</Badge>
        </div>
        {product.variants.length === 0 ? (
          <p className="text-sm text-slate-500">This product has no variants.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Attribute</Th>
                <Th>Value</Th>
                <Th className="text-right">Extra price</Th>
                <Th className="text-right">Line price</Th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <Td>{v.attribute}</Td>
                  <Td>{v.value}</Td>
                  <Td className="text-right tabular-nums">+{formatMoney(v.extraPrice)}</Td>
                  <Td className="text-right tabular-nums">
                    {formatMoney(toNumber(product.salesPrice) + toNumber(v.extraPrice))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="mt-3 text-xs text-slate-500">Variant editing arrives in the next update.</p>
      </Card>
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
