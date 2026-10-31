import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { TaxesManager, type TaxRow } from "./taxes-manager";

export default async function TaxesPage() {
  await requireAdmin();

  const taxes = await db.tax.findMany({
    orderBy: [{ active: "desc" }, { rate: "asc" }, { name: "asc" }, { id: "asc" }],
    include: { _count: { select: { products: true, subscriptionLines: true } } },
  });

  const rows: TaxRow[] = taxes.map((t) => ({
    id: t.id,
    name: t.name,
    rate: toNumber(t.rate),
    active: t.active,
    products: t._count.products,
    subscriptionLines: t._count.subscriptionLines,
  }));

  return <TaxesManager taxes={rows} />;
}
