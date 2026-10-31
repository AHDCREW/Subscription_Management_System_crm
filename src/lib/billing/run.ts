// The billing run: activates confirmed subscriptions that have started, then
// creates one DRAFT invoice per due billing period for every ACTIVE
// subscription, and auto-closes expired subscriptions whose plan says so.
//
// Server-side only (it talks to MySQL through Prisma). It deliberately has no
// `import "server-only"` so scripts and scheduled jobs can call runBilling()
// directly; it is never imported from a client component.
//
// No double billing: Invoice has @@unique([subscriptionId, periodStart]). Each
// period is created in its own transaction; if that period already has an
// invoice (P2002), nothing is created and nextInvoiceDate still moves past it,
// so re-running the billing run creates nothing new. Nothing is skipped either:
// a subscription several periods behind gets one invoice per missed period.

import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { toNumber } from "../money";
import { calculateInvoice, type CalculatedInvoice } from "./calculate";
import type { DiscountRule } from "./discounts";
import { dueDateFor, formatInvoiceNumber, invoiceLineDescription, startOfTomorrow, toDiscountRule } from "./invoice";
import { duePeriods, toUtcDate } from "./period";

export const BILLING_BATCH_SIZE = 200;

export interface BillingRunError {
  subscriptionId: number;
  subscriptionNumber: string;
  message: string;
}

export interface BillingRunSummary {
  /** The calendar day billed up to (YYYY-MM-DD, UTC). */
  today: string;
  startedAt: string;
  finishedAt: string;
  activated: number;
  invoicesCreated: number;
  skippedDuplicates: number;
  closed: number;
  errors: BillingRunError[];
}

export interface RunBillingOptions {
  today?: Date;
  batchSize?: number;
}

const subscriptionForBilling = {
  id: true,
  number: true,
  customerId: true,
  discountId: true,
  nextInvoiceDate: true,
  expiryDate: true,
  paymentTermDays: true,
  plan: { select: { name: true, price: true, billingPeriod: true } },
  lines: {
    orderBy: { id: "asc" },
    select: {
      productId: true,
      description: true,
      quantity: true,
      unitPrice: true,
      product: { select: { name: true } },
      variant: { select: { attribute: true, value: true } },
      tax: { select: { rate: true } },
    },
  },
} satisfies Prisma.SubscriptionSelect;

type BillableSubscription = Prisma.SubscriptionGetPayload<{ select: typeof subscriptionForBilling }>;

/** Thrown inside a transaction when a discount hit its usage limit after we picked it. */
class DiscountUsedUpError extends Error {
  constructor(readonly discountId: number) {
    super(`Discount ${discountId} reached its usage limit`);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) return `${err.code}: ${err.message.split("\n").pop()}`;
  return err instanceof Error ? err.message : String(err);
}

/** True when the error is the (subscriptionId, periodStart) unique key: the period is already invoiced. */
export function isDuplicatePeriodError(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  const target = err.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return fields.includes("periodStart");
}

/** A unique throwaway invoice number (fits VarChar(20)); replaced by the real number in the same transaction. */
function temporaryInvoiceNumber(): string {
  return `TMP-${randomBytes(8).toString("hex")}`;
}

// ───────────────────────────── Last run (in memory) ─────────────────────────────

const lastRunStore = globalThis as unknown as { __subflowLastBillingRun?: BillingRunSummary };

/** The most recent billing run on this server process, if any. */
export function getLastBillingRun(): BillingRunSummary | null {
  return lastRunStore.__subflowLastBillingRun ?? null;
}

// ───────────────────────────── Steps ─────────────────────────────

/** CONFIRMED subscriptions whose start date has arrived become ACTIVE, billed from their start date. */
async function activateStartedSubscriptions(tomorrow: Date, batchSize: number, errors: BillingRunError[]) {
  let activated = 0;
  let cursor = 0;
  for (;;) {
    const batch = await db.subscription.findMany({
      where: { status: "CONFIRMED", startDate: { lt: tomorrow }, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: { id: true, number: true, startDate: true, nextInvoiceDate: true },
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    for (const sub of batch) {
      try {
        // Conditional on the status so a concurrent run (or an edit) can't double-activate.
        const { count } = await db.subscription.updateMany({
          where: { id: sub.id, status: "CONFIRMED" },
          data: { status: "ACTIVE", nextInvoiceDate: sub.nextInvoiceDate ?? toUtcDate(sub.startDate) },
        });
        activated += count;
      } catch (err) {
        errors.push({ subscriptionId: sub.id, subscriptionNumber: sub.number, message: errorMessage(err) });
      }
    }
    if (batch.length < batchSize) break;
  }
  return activated;
}

async function loadDiscounts(): Promise<Map<number, DiscountRule>> {
  const rows = await db.discount.findMany({
    where: { active: true },
    include: { products: { select: { productId: true } } },
  });
  return new Map(rows.map((row) => [row.id, toDiscountRule(row)]));
}

function calculatePeriod(sub: BillableSubscription, discounts: Map<number, DiscountRule>, on: Date): CalculatedInvoice {
  return calculateInvoice({
    lines: sub.lines.map((line) => ({
      productId: line.productId,
      description: invoiceLineDescription({
        description: line.description,
        productName: line.product.name,
        variant: line.variant,
      }),
      quantity: line.quantity,
      unitPrice: toNumber(line.unitPrice),
      taxRate: line.tax ? toNumber(line.tax.rate) : null,
    })),
    planPrice: toNumber(sub.plan.price),
    planName: sub.plan.name,
    discounts: [...discounts.values()],
    pinnedDiscountId: sub.discountId,
    on,
  });
}

type PeriodOutcome = "created" | "duplicate";

const MAX_PERIOD_ATTEMPTS = 4;

/** Move nextInvoiceDate forward to `end` (never backwards, so concurrent runs can't rewind it). */
function advanceNextInvoiceDate(client: Prisma.TransactionClient, subscriptionId: number, end: Date) {
  return client.subscription.updateMany({
    where: { id: subscriptionId, OR: [{ nextInvoiceDate: null }, { nextInvoiceDate: { lt: end } }] },
    data: { nextInvoiceDate: end },
  });
}

/** MySQL deadlock / write conflict between concurrent runs: safe to retry the whole transaction. */
function isRetryableConflict(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
}

/** Create the invoice for one period in its own transaction and move nextInvoiceDate to the period end. */
async function billPeriod(
  sub: BillableSubscription,
  period: { start: Date; end: Date },
  discounts: Map<number, DiscountRule>,
  invoiceTag: string,
): Promise<PeriodOutcome> {
  for (let attempt = 1; attempt <= MAX_PERIOD_ATTEMPTS; attempt++) {
    // Cheap pre-check so a normal re-run doesn't even attempt the insert; the unique key still guards races.
    const existing = await db.invoice.findUnique({
      where: { subscriptionId_periodStart: { subscriptionId: sub.id, periodStart: period.start } },
      select: { id: true },
    });
    if (existing) {
      await advanceNextInvoiceDate(db, sub.id, period.end);
      return "duplicate";
    }

    const calc = calculatePeriod(sub, discounts, period.start);
    try {
      await db.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            number: temporaryInvoiceNumber(),
            status: "DRAFT",
            customerId: sub.customerId,
            subscriptionId: sub.id,
            invoiceDate: period.start,
            dueDate: dueDateFor(period.start, sub.paymentTermDays),
            periodStart: period.start,
            periodEnd: period.end,
            subtotal: calc.subtotal,
            discountTotal: calc.discountTotal,
            taxTotal: calc.taxTotal,
            total: calc.total,
            lines: {
              create: calc.lines.map((line) => ({
                productId: line.productId,
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                discountAmount: line.discountAmount,
                taxRate: line.taxRate,
                taxAmount: line.taxAmount,
                // quantity × unit price, before discount and tax (Invoice.subtotal is their sum).
                amount: line.amount,
              })),
            },
          },
          select: { id: true },
        });

        // Number from the auto-increment id: unique and race-free without a counter table.
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { number: formatInvoiceNumber(invoiceTag, invoice.id) },
        });

        if (calc.appliedDiscountId !== null) {
          const { count } = await tx.discount.updateMany({
            where: {
              id: calc.appliedDiscountId,
              OR: [{ usageLimit: null }, { usedCount: { lt: db.discount.fields.usageLimit } }],
            },
            data: { usedCount: { increment: 1 } },
          });
          if (count === 0) throw new DiscountUsedUpError(calc.appliedDiscountId);
        }

        await advanceNextInvoiceDate(tx, sub.id, period.end);
      });

      if (calc.appliedDiscountId !== null) {
        const used = discounts.get(calc.appliedDiscountId);
        if (used) used.usedCount += 1;
      }
      return "created";
    } catch (err) {
      if (err instanceof DiscountUsedUpError) {
        // Someone else took the last allowed use meanwhile: recalculate without it.
        const rule = discounts.get(err.discountId);
        if (rule) rule.active = false;
        continue;
      }
      if (isDuplicatePeriodError(err)) {
        // Invoiced by a concurrent run: bill nothing, but don't get stuck on it.
        await advanceNextInvoiceDate(db, sub.id, period.end);
        return "duplicate";
      }
      if (isRetryableConflict(err) && attempt < MAX_PERIOD_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 25 * attempt + Math.random() * 25));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Could not bill the period starting ${period.start.toISOString().slice(0, 10)}; try again.`);
}

/** ACTIVE subscriptions on auto-close plans whose expiry has passed and that have nothing left to bill. */
async function autoCloseExpired(tomorrow: Date, now: Date) {
  const { count } = await db.subscription.updateMany({
    where: {
      status: "ACTIVE",
      plan: { autoClose: true },
      expiryDate: { lt: tomorrow },
      // Billed up to the expiry date (a failed period keeps nextInvoiceDate before it).
      OR: [{ nextInvoiceDate: null }, { nextInvoiceDate: { gte: db.subscription.fields.expiryDate } }],
    },
    data: { status: "CLOSED", closedAt: now },
  });
  return count;
}

// ───────────────────────────── Entry point ─────────────────────────────

/**
 * Run billing up to and including `today` (calendar day, UTC). Safe to run any
 * number of times: already-invoiced periods are never billed again. One
 * failing subscription is reported in `errors` and does not stop the run.
 */
export async function runBilling({ today = new Date(), batchSize = BILLING_BATCH_SIZE }: RunBillingOptions = {}) {
  const startedAt = new Date();
  const day = toUtcDate(today);
  const tomorrow = startOfTomorrow(day);
  const errors: BillingRunError[] = [];

  const activated = await activateStartedSubscriptions(tomorrow, batchSize, errors);

  const settings = await db.companySettings.findUnique({ where: { id: 1 }, select: { invoiceTag: true } });
  const invoiceTag = settings?.invoiceTag ?? "INV";

  let invoicesCreated = 0;
  let skippedDuplicates = 0;
  let cursor = 0;
  for (;;) {
    const batch = await db.subscription.findMany({
      where: { status: "ACTIVE", nextInvoiceDate: { lt: tomorrow }, id: { gt: cursor } },
      orderBy: { id: "asc" },
      take: batchSize,
      select: subscriptionForBilling,
    });
    if (batch.length === 0) break;
    cursor = batch[batch.length - 1].id;

    const discounts = await loadDiscounts();
    for (const sub of batch) {
      if (!sub.nextInvoiceDate) continue;
      try {
        const periods = duePeriods(sub.nextInvoiceDate, day, sub.plan.billingPeriod, sub.expiryDate);
        for (const period of periods) {
          const outcome = await billPeriod(sub, period, discounts, invoiceTag);
          if (outcome === "created") invoicesCreated += 1;
          else skippedDuplicates += 1;
        }
      } catch (err) {
        errors.push({ subscriptionId: sub.id, subscriptionNumber: sub.number, message: errorMessage(err) });
      }
    }
    if (batch.length < batchSize) break;
  }

  let closed = 0;
  try {
    closed = await autoCloseExpired(tomorrow, new Date());
  } catch (err) {
    errors.push({ subscriptionId: 0, subscriptionNumber: "auto-close", message: errorMessage(err) });
  }

  const summary: BillingRunSummary = {
    today: day.toISOString().slice(0, 10),
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    activated,
    invoicesCreated,
    skippedDuplicates,
    closed,
    errors,
  };
  lastRunStore.__subflowLastBillingRun = summary;
  return summary;
}
