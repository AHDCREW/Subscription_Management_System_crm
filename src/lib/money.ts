import type { Prisma } from "@prisma/client";

type Numeric = number | string | Prisma.Decimal | null | undefined;

export function toNumber(value: Numeric): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "number" ? value : Number(value.toString());
}

// Round to paise so stored totals always add up.
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatMoney(value: Numeric, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(toNumber(value));
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}
