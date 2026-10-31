import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import type { TaxOption } from "./product-form";

// Active taxes for the "Default tax" select. A product's current tax stays selectable even if it was deactivated.
export async function taxOptions(currentTaxId?: number | null): Promise<TaxOption[]> {
  const taxes = await db.tax.findMany({
    where: currentTaxId ? { OR: [{ active: true }, { id: currentTaxId }] } : { active: true },
    orderBy: [{ rate: "asc" }, { name: "asc" }],
  });
  return taxes.map((t) => ({ id: t.id, label: `${taxLabel(t)}${t.active ? "" : " — inactive"}` }));
}

// "GST 18%" already names its rate; otherwise append it, e.g. "VAT (12%)".
export function taxLabel(tax: { name: string; rate: Parameters<typeof toNumber>[0] }) {
  return tax.name.includes("%") ? tax.name : `${tax.name} (${toNumber(tax.rate)}%)`;
}
