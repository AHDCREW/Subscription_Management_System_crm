import "server-only";
import type { BillingPeriod } from "@prisma/client";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { toDateInput } from "@/lib/subscriptions/subscriptions";

// Plain (serialisable) shapes passed from the server pages to the client form.

export type CustomerOption = { id: number; name: string; email: string; company: string | null };

export type SubPlanOption = {
  id: number;
  name: string;
  price: number;
  billingPeriod: BillingPeriod;
  minQuantity: number;
  // YYYY-MM-DD or "" when open-ended.
  startDate: string;
  endDate: string;
};

export type TaxOption = { id: number; label: string; rate: number };

export type SubVariantOption = { id: number; label: string; extraPrice: number };

export type SubProductOption = {
  id: number;
  name: string;
  salesPrice: number;
  taxId: number | null;
  variants: SubVariantOption[];
};

export type TemplateOption = {
  id: number;
  name: string;
  planId: number;
  validityDays: number;
  notes: string;
  lines: { productId: number; variantId: number | null; quantity: number }[];
};

export type SubscriptionLineValue = {
  productId: number;
  variantId: number | null;
  quantity: number;
  unitPrice: number;
  taxId: number | null;
};

export type SubscriptionFormValues = {
  id?: number;
  number?: string;
  customer: CustomerOption | null;
  planId: number | null;
  templateId: number | null;
  startDate: string;
  expiryDate: string;
  paymentTermDays: number;
  notes: string;
  lines: SubscriptionLineValue[];
};

export type SubscriptionFormOptions = {
  plans: SubPlanOption[];
  products: SubProductOption[];
  taxes: TaxOption[];
  templates: TemplateOption[];
};

export const CUSTOMER_SEARCH_LIMIT = 20;

export const customerSelect = { id: true, name: true, email: true, company: true } as const;

// "GST 18%" already names its rate; otherwise append it, e.g. "VAT (12%)".
export function taxLabel(tax: { name: string; rate: Parameters<typeof toNumber>[0] }) {
  return tax.name.includes("%") ? tax.name : `${tax.name} (${toNumber(tax.rate)}%)`;
}

// Active plans, products and taxes. When editing, the taxes already on the
// subscription stay selectable even if they were deactivated since.
export async function getSubscriptionFormOptions(keepTaxIds: number[] = []): Promise<SubscriptionFormOptions> {
  const [plans, products, taxes, templates] = await Promise.all([
    db.plan.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        price: true,
        billingPeriod: true,
        minQuantity: true,
        startDate: true,
        endDate: true,
      },
    }),
    db.product.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        salesPrice: true,
        taxId: true,
        variants: {
          orderBy: [{ attribute: "asc" }, { value: "asc" }],
          select: { id: true, attribute: true, value: true, extraPrice: true },
        },
      },
    }),
    db.tax.findMany({
      where: keepTaxIds.length ? { OR: [{ active: true }, { id: { in: keepTaxIds } }] } : { active: true },
      orderBy: [{ rate: "asc" }, { name: "asc" }],
      select: { id: true, name: true, rate: true, active: true },
    }),
    db.quotationTemplate.findMany({
      where: { plan: { active: true } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        planId: true,
        validityDays: true,
        notes: true,
        lines: { orderBy: { id: "asc" }, select: { productId: true, variantId: true, quantity: true } },
      },
    }),
  ]);

  return {
    plans: plans.map((plan) => ({
      ...plan,
      price: toNumber(plan.price),
      startDate: toDateInput(plan.startDate),
      endDate: toDateInput(plan.endDate),
    })),
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      salesPrice: toNumber(product.salesPrice),
      taxId: product.taxId,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        label: `${variant.attribute}: ${variant.value}`,
        extraPrice: toNumber(variant.extraPrice),
      })),
    })),
    taxes: taxes.map((tax) => ({
      id: tax.id,
      label: `${taxLabel(tax)}${tax.active ? "" : " — inactive"}`,
      rate: toNumber(tax.rate),
    })),
    templates: templates.map((template) => ({ ...template, notes: template.notes ?? "" })),
  };
}

// First customers shown in the picker before anything is typed.
export async function getInitialCustomers(): Promise<CustomerOption[]> {
  return db.user.findMany({
    where: { role: "CUSTOMER" },
    orderBy: { name: "asc" },
    take: CUSTOMER_SEARCH_LIMIT,
    select: customerSelect,
  });
}
