import "server-only";
import type { BillingPeriod, ProductType } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { OPEN_REQUEST, plansOnSaleWhere } from "@/lib/subscriptions/quote-requests";
import { toDateInput } from "@/lib/subscriptions/subscriptions";

// What a customer can ask for: active products, the plans on sale today and the
// quotation templates built on them. Plain (serialisable) shapes, so the same
// data feeds the Products page and the request form.

export type CatalogVariant = { id: number; attribute: string; value: string; label: string; extraPrice: number };

export type CatalogProduct = {
  id: number;
  name: string;
  type: ProductType;
  salesPrice: number;
  notes: string | null;
  variants: CatalogVariant[];
};

export type CatalogPlan = {
  id: number;
  name: string;
  price: number;
  billingPeriod: BillingPeriod;
  minQuantity: number;
  // YYYY-MM-DD or "" when open-ended.
  endDate: string;
  pausable: boolean;
  renewable: boolean;
  closable: boolean;
  autoClose: boolean;
};

export type CatalogTemplate = {
  id: number;
  name: string;
  planId: number;
  validityDays: number;
  // Only lines whose product is still sold.
  lines: { productId: number; variantId: number | null; quantity: number }[];
};

export type RequestCatalog = { products: CatalogProduct[]; plans: CatalogPlan[]; templates: CatalogTemplate[] };

// The catalog is small; the caps only keep a runaway catalog from flooding the page.
const MAX_PRODUCTS = 200;
const MAX_PLANS = 50;
const MAX_TEMPLATES = 50;

export async function getRequestCatalog(today: Date): Promise<RequestCatalog> {
  const onSale = plansOnSaleWhere(today);
  const [products, plans, templates] = await Promise.all([
    db.product.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: MAX_PRODUCTS,
      select: {
        id: true,
        name: true,
        type: true,
        salesPrice: true,
        notes: true,
        variants: {
          orderBy: [{ attribute: "asc" }, { extraPrice: "asc" }, { value: "asc" }],
          select: { id: true, attribute: true, value: true, extraPrice: true },
        },
      },
    }),
    db.plan.findMany({
      where: onSale,
      orderBy: [{ price: "asc" }, { name: "asc" }],
      take: MAX_PLANS,
      select: {
        id: true,
        name: true,
        price: true,
        billingPeriod: true,
        minQuantity: true,
        endDate: true,
        pausable: true,
        renewable: true,
        closable: true,
        autoClose: true,
      },
    }),
    db.quotationTemplate.findMany({
      where: { plan: onSale },
      orderBy: { name: "asc" },
      take: MAX_TEMPLATES,
      select: {
        id: true,
        name: true,
        planId: true,
        validityDays: true,
        lines: {
          where: { product: { active: true } },
          orderBy: { id: "asc" },
          select: { productId: true, variantId: true, quantity: true },
        },
      },
    }),
  ]);

  return {
    products: products.map((product) => ({
      ...product,
      salesPrice: toNumber(product.salesPrice),
      variants: product.variants.map((variant) => ({
        ...variant,
        label: `${variant.attribute}: ${variant.value}`,
        extraPrice: toNumber(variant.extraPrice),
      })),
    })),
    plans: plans.map((plan) => ({ ...plan, price: toNumber(plan.price), endDate: toDateInput(plan.endDate) })),
    templates,
  };
}

export function countOpenRequests(customerId: number) {
  return db.subscription.count({ where: { customerId, ...OPEN_REQUEST } });
}
