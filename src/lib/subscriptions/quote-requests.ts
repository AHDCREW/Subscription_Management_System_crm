import type { Prisma, SubscriptionStatus } from "@prisma/client";
import type { BadgeTone } from "@/components/kit";
import type { toNumber } from "@/lib/money";
import { addDays, formatDay, isPlanAvailableOn } from "@/lib/subscriptions/subscriptions";
import { lineUnitPrice } from "@/lib/subscriptions/templates";

// Quotation requests customers send from the portal. A request is a Draft with
// `requestedAt` set; staff review it and send it as a quotation like any other
// draft. Pure helpers, no database access, so the request form can import the
// limits and the server action the checks.

type Numeric = Parameters<typeof toNumber>[0];

// Open requests a customer may have with the team at once.
export const MAX_OPEN_REQUESTS = 3;
export const REQUEST_MAX_LINES = 20;
// How far ahead a customer may ask a subscription to start.
export const REQUEST_START_WITHIN_DAYS = 365;

// A customer's request that staff haven't sent as a quotation yet.
export const OPEN_REQUEST = { status: "DRAFT", requestedAt: { not: null } } satisfies Prisma.SubscriptionWhereInput;

export function isOpenRequest(sub: { status: SubscriptionStatus; requestedAt: Date | string | null }): boolean {
  return sub.status === "DRAFT" && sub.requestedAt !== null;
}

// How a customer sees their own open request instead of "Draft".
export const REQUESTED_STATUS: { label: string; tone: BadgeTone } = { label: "Requested", tone: "blue" };

export function requestsLeft(openCount: number): number {
  return Math.max(0, MAX_OPEN_REQUESTS - openCount);
}

// Plans on sale today, the same rule as the public pricing page: active and
// inside their own start/end dates. The query twin of `isPlanAvailableOn`.
export function plansOnSaleWhere(today: Date): Prisma.PlanWhereInput {
  return {
    active: true,
    AND: [
      { OR: [{ startDate: null }, { startDate: { lte: today } }] },
      { OR: [{ endDate: null }, { endDate: { gte: today } }] },
    ],
  };
}

export type RequestPlan = {
  name: string;
  active: boolean;
  minQuantity: number;
  startDate: Date | null;
  endDate: Date | null;
};

export type RequestProduct = {
  id: number;
  name: string;
  active: boolean;
  salesPrice: Numeric;
  taxId: number | null;
  tax: { active: boolean } | null;
  variants: { id: number; attribute: string; value: string; extraPrice: Numeric }[];
};

// `key` is the form's row key, so errors stay on the right row.
export type RequestLineInput = { key: string; productId: number; variantId: number | null; quantity: number };

export type PricedRequestLine = {
  productId: number;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxId: number | null;
};

export type RequestFieldErrors = Partial<Record<"planId" | "startDate" | "lines", string>>;

export type RequestCheck =
  | { ok: true; lines: PricedRequestLine[] }
  | { ok: false; fieldErrors: RequestFieldErrors; lineErrors: Record<string, string> };

/**
 * Checks a request against the catalog and prices its lines. Prices never come
 * from the customer: each unit price is the product's sales price plus the
 * variant's extra price, and each line takes the product's own tax while that
 * tax is active, as a new subscription does on the team's form.
 */
export function checkQuoteRequest({
  plan,
  startDate,
  lines,
  products,
  today,
}: {
  plan: RequestPlan | null;
  startDate: Date;
  lines: RequestLineInput[];
  products: RequestProduct[];
  today: Date;
}): RequestCheck {
  const fieldErrors: RequestFieldErrors = {};
  const lineErrors: Record<string, string> = {};

  if (startDate.getTime() < today.getTime()) fieldErrors.startDate = "Choose a start date from today onwards.";
  else if (startDate.getTime() > addDays(today, REQUEST_START_WITHIN_DAYS).getTime()) {
    fieldErrors.startDate = "Choose a start date within the next year.";
  }

  if (!plan) fieldErrors.planId = "That plan is no longer available. Choose another.";
  else if (!isPlanAvailableOn(plan, today)) fieldErrors.planId = `${plan.name} isn't on sale right now. Choose another plan.`;
  else if (!fieldErrors.startDate && !isPlanAvailableOn(plan, startDate)) {
    // On sale today, so only its end date can rule the start date out.
    fieldErrors.startDate = `${plan.name} is on sale until ${formatDay(plan.endDate)}. Choose a start date on or before then.`;
  }

  if (lines.length === 0) fieldErrors.lines = "Add at least one product.";
  else if (lines.length > REQUEST_MAX_LINES) fieldErrors.lines = `A request can have at most ${REQUEST_MAX_LINES} lines.`;

  const productsById = new Map(products.map((product) => [product.id, product]));
  const priced: PricedRequestLine[] = [];
  for (const line of lines) {
    const product = productsById.get(line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    if (!product) {
      lineErrors[line.key] = "This product is no longer available.";
    } else if (!product.active) {
      lineErrors[line.key] = `${product.name} is no longer sold. Remove this line.`;
    } else if (line.variantId !== null && !variant) {
      lineErrors[line.key] = `That variant isn't available for ${product.name}.`;
    } else if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      lineErrors[line.key] = "Quantity must be at least 1.";
    } else if (plan && line.quantity < plan.minQuantity) {
      lineErrors[line.key] = `${plan.name} needs a quantity of at least ${plan.minQuantity} per line.`;
    } else {
      priced.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        description: variant ? `${product.name} (${variant.attribute}: ${variant.value})` : product.name,
        quantity: line.quantity,
        unitPrice: lineUnitPrice(product.salesPrice, variant?.extraPrice),
        taxId: product.taxId && product.tax?.active ? product.taxId : null,
      });
    }
  }

  if (Object.keys(fieldErrors).length || Object.keys(lineErrors).length) return { ok: false, fieldErrors, lineErrors };
  return { ok: true, lines: priced };
}
