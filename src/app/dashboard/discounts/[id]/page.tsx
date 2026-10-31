import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDateInput } from "@/lib/subscriptions/subscriptions";
import { discountStatus } from "@/lib/catalog/discounts";
import { Badge, ButtonLink, PageHeader } from "@/components/kit";
import { DeleteDiscount, ToggleDiscount } from "../discount-actions";
import { DiscountForm } from "../discount-form";

export default async function DiscountPage({ params }: PageProps<"/dashboard/discounts/[id]">) {
  await requireAdmin();

  const { id: rawId } = await params;
  const id = /^\d+$/.test(rawId) ? Number(rawId) : NaN;
  if (!Number.isSafeInteger(id)) notFound();

  const discount = await db.discount.findUnique({
    where: { id },
    include: { products: { select: { productId: true } }, _count: { select: { subscriptions: true } } },
  });
  if (!discount) notFound();

  const linked = discount.products.map((p) => p.productId);
  // Active products, plus any inactive ones this discount already covers so they can be kept or removed.
  const products = await db.product.findMany({
    where: { OR: [{ active: true }, { id: { in: linked } }] },
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    select: { id: true, name: true, active: true },
  });

  const value = toNumber(discount.value);
  const status = discountStatus({ ...discount, value });
  const deletable = discount.usedCount === 0 && discount._count.subscriptions === 0;
  const target = { id: discount.id, name: discount.name, active: discount.active };
  const pinned = discount._count.subscriptions;

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={discount.name}
        description="Edit the discount rule."
        actions={
          <>
            <ButtonLink href="/dashboard/discounts" variant="ghost">
              Back to discounts
            </ButtonLink>
            {deletable && <DeleteDiscount discount={target} redirectTo="/dashboard/discounts" />}
            <ToggleDiscount discount={target} />
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <Badge tone={status.tone}>{status.label}</Badge>
        <span className="tabular-nums">
          Used {discount.usedCount} {discount.usedCount === 1 ? "time" : "times"}
          {discount.usageLimit !== null && ` of ${discount.usageLimit}`}
        </span>
        {pinned > 0 && (
          <span>
            Set on {pinned} {pinned === 1 ? "subscription" : "subscriptions"}
          </span>
        )}
      </div>

      <DiscountForm
        discountId={discount.id}
        products={products}
        usedCount={discount.usedCount}
        initial={{
          name: discount.name,
          type: discount.type,
          value: value.toFixed(2).replace(/\.00$/, ""),
          scope: discount.scope,
          productIds: linked.map(String),
          minPurchase: discount.minPurchase === null ? "" : toNumber(discount.minPurchase).toFixed(2).replace(/\.00$/, ""),
          minQuantity: discount.minQuantity === null ? "" : String(discount.minQuantity),
          startDate: toDateInput(discount.startDate),
          endDate: toDateInput(discount.endDate),
          usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
          active: discount.active,
        }}
      />
    </div>
  );
}
