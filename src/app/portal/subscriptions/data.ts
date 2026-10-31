import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { OPEN_REQUEST } from "@/lib/subscriptions/quote-requests";
import { subscriptionTotals } from "@/lib/subscriptions/subscriptions";

// Portal queries. Every one is scoped to the signed-in customer's id, so a
// customer can never read another customer's subscriptions. Drafts are internal
// to the team and never shown in the portal, except the customer's own
// quotation requests (Drafts with `requestedAt`).

export function customerSubscriptionsWhere(customerId: number): Prisma.SubscriptionWhereInput {
  return { customerId, OR: [{ status: { not: "DRAFT" } }, OPEN_REQUEST] };
}

const listSelect = {
  id: true,
  number: true,
  status: true,
  requestedAt: true,
  startDate: true,
  expiryDate: true,
  nextInvoiceDate: true,
  plan: { select: { name: true, price: true, billingPeriod: true } },
  lines: { select: { quantity: true, unitPrice: true, tax: { select: { rate: true } } } },
} satisfies Prisma.SubscriptionSelect;

type ListRow = Prisma.SubscriptionGetPayload<{ select: typeof listSelect }>;

/** Recurring amount for one billing period (plan fee + lines + tax, before discounts). */
export function recurringTotal(sub: Pick<ListRow, "plan" | "lines">): number {
  return subscriptionTotals(
    sub.plan.price,
    sub.lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice, taxRate: line.tax?.rate })),
  ).total;
}

export function getCustomerSubscriptions(customerId: number, take?: number) {
  return db.subscription.findMany({
    where: customerSubscriptionsWhere(customerId),
    orderBy: { id: "desc" },
    take,
    select: listSelect,
  });
}

export type CustomerSubscriptionRow = ListRow;

/** The customer's active subscription billed soonest, or null. */
export function getNextBill(customerId: number) {
  return db.subscription.findFirst({
    where: { customerId, status: "ACTIVE", nextInvoiceDate: { not: null } },
    orderBy: [{ nextInvoiceDate: "asc" }, { id: "asc" }],
    select: listSelect,
  });
}

/** Bills are only expected for subscriptions that are running (or about to start). */
export function showsNextBill(status: ListRow["status"]): boolean {
  return status === "ACTIVE" || status === "CONFIRMED";
}

export const NO_SUBSCRIPTIONS =
  "You don't have any subscriptions yet. Request a quotation and Brightloop's team will send you one.";
