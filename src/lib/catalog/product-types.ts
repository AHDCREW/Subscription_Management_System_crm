import type { ProductType } from "@prisma/client";
import type { BadgeTone } from "@/components/ui";

// Client-safe product labels (no zod / server code), used by lists, badges and forms.

export const PRODUCT_TYPES: { value: ProductType; label: string; tone: BadgeTone }[] = [
  { value: "SOFTWARE", label: "Software", tone: "indigo" },
  { value: "ADDON", label: "Add-on", tone: "blue" },
  { value: "SERVICE", label: "Service", tone: "amber" },
];

export function productTypeInfo(type: ProductType) {
  return PRODUCT_TYPES.find((t) => t.value === type) ?? PRODUCT_TYPES[0];
}

export function isProductType(value: unknown): value is ProductType {
  return PRODUCT_TYPES.some((t) => t.value === value);
}

export const PRODUCTS_PAGE_SIZE = 25;
