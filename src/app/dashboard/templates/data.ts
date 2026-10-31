import "server-only";
import type { BillingPeriod } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";

// Plain (serialisable) shapes passed from the server pages to the client form.
export type PlanOption = {
  id: number;
  name: string;
  price: number;
  billingPeriod: BillingPeriod;
  minQuantity: number;
};

export type VariantOption = { id: number; label: string; extraPrice: number };

export type ProductOption = { id: number; name: string; salesPrice: number; variants: VariantOption[] };

export type TemplateLineValue = { productId: number; variantId: number | null; quantity: number };

export type TemplateFormValues = {
  id?: number;
  name: string;
  planId: number | null;
  validityDays: number;
  notes: string;
  lines: TemplateLineValue[];
};

// Only active plans and products can be put on a template.
export async function getTemplateFormOptions(): Promise<{ plans: PlanOption[]; products: ProductOption[] }> {
  const [plans, products] = await Promise.all([
    db.plan.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, price: true, billingPeriod: true, minQuantity: true },
    }),
    db.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        salesPrice: true,
        variants: {
          orderBy: [{ attribute: "asc" }, { value: "asc" }],
          select: { id: true, attribute: true, value: true, extraPrice: true },
        },
      },
    }),
  ]);

  return {
    plans: plans.map((plan) => ({ ...plan, price: toNumber(plan.price) })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      salesPrice: toNumber(product.salesPrice),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        label: `${variant.attribute}: ${variant.value}`,
        extraPrice: toNumber(variant.extraPrice),
      })),
    })),
  };
}
