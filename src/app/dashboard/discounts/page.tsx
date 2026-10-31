import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { todayUtc } from "@/lib/subscriptions/subscriptions";
import { discountStatus, formatDiscountValue, formatRupees, validityLabel } from "@/lib/catalog/discounts";
import { Badge, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/kit";
import { DeleteDiscount, ToggleDiscount } from "./discount-actions";

const muted = <span className="text-muted-foreground">—</span>;

export default async function DiscountsPage() {
  await requireAdmin();

  const discounts = await db.discount.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true, subscriptions: true } } },
  });
  const today = todayUtc();

  return (
    <>
      <PageHeader
        title="Discounts"
        description="Discount rules applied to invoices while they are valid."
        actions={discounts.length > 0 && <ButtonLink href="/dashboard/discounts/new">New discount</ButtonLink>}
      />

      {discounts.length === 0 ? (
        <EmptyState
          message="No discount rules yet."
          action={<ButtonLink href="/dashboard/discounts/new">Add your first discount</ButtonLink>}
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="text-right">Value</Th>
              <Th>Applies to</Th>
              <Th>Conditions</Th>
              <Th>Valid</Th>
              <Th className="text-right">Used</Th>
              <Th>Status</Th>
              <Th className="w-0">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {discounts.map((d) => {
              const rule = { ...d, value: toNumber(d.value) };
              const status = discountStatus(rule, today);
              const minPurchase = d.minPurchase === null ? null : toNumber(d.minPurchase);
              const conditions = [
                minPurchase !== null && `Min ${formatRupees(minPurchase)}`,
                d.minQuantity !== null && `Min qty ${d.minQuantity}`,
              ].filter(Boolean);
              const deletable = d.usedCount === 0 && d._count.subscriptions === 0;
              const products = d._count.products;
              const target = { id: d.id, name: d.name, active: d.active };

              return (
                <tr key={d.id} className="transition-colors hover:bg-muted/40">
                  <Td>
                    <Link
                      href={`/dashboard/discounts/${d.id}`}
                      className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                    >
                      {d.name}
                    </Link>
                  </Td>
                  <Td className="text-right tabular-nums">{formatDiscountValue(rule)}</Td>
                  <Td>
                    {d.scope === "SUBSCRIPTION" ? "Whole subscription" : `${products} ${products === 1 ? "product" : "products"}`}
                  </Td>
                  <Td className="tabular-nums">{conditions.length ? conditions.join(" · ") : muted}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {d.startDate || d.endDate ? validityLabel(d.startDate, d.endDate) : muted}
                  </Td>
                  <Td className="text-right whitespace-nowrap tabular-nums">
                    {d.usedCount} / {d.usageLimit ?? <span className="text-muted-foreground">∞</span>}
                  </Td>
                  <Td>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </Td>
                  <Td className="sticky right-0 bg-card py-1.5 shadow-[-8px_0_8px_-8px_rgb(0_0_0/0.12)]">
                    <div className="flex items-center justify-end gap-1">
                      <ToggleDiscount discount={target} compact />
                      {deletable && <DeleteDiscount discount={target} compact />}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}
