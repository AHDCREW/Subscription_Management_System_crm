// Runs billing and records it as a BillingRun row. Used by the "Run billing
// now" button (MANUAL) and the daily scheduler (SCHEDULED).
//
// Never two runs at once: a MySQL named lock (GET_LOCK) guards the run, so the
// button, the scheduler and any number of server instances can't overlap.
// GET_LOCK belongs to one database connection, so the lock is taken and
// released inside an interactive transaction, which keeps a single pooled
// connection for its whole lifetime. The billing work itself runs on the
// normal client (its own short transactions); the lock transaction only holds
// the connection. If the process dies, MySQL drops the connection and with it
// the lock.
//
// Server-side only, like ../billing/run (no "server-only" import, so scripts
// and the scheduler can use it too).

import { Prisma, type BillingRunTrigger } from "@prisma/client";
import { db } from "../db";
import { runBilling, type BillingRunSummary } from "../billing/run";
import { businessDay, shouldRunScheduledBilling } from "./schedule";

export const BILLING_LOCK_NAME = "subflow_billing";
/** Only the first errors are stored on the run; errorCount keeps the full number. */
export const MAX_STORED_ERRORS = 20;
/** Upper bound for one run while holding the lock connection. */
const LOCK_HOLD_TIMEOUT_MS = 2 * 60 * 60 * 1000;

export const BILLING_IN_PROGRESS_MESSAGE = "A billing run is already in progress. Try again in a minute.";

export interface StoredBillingError {
  subscriptionNumber: string;
  message: string;
}

export type BillingJobResult =
  | { status: "completed"; runId: number; summary: BillingRunSummary }
  /** Another run holds the lock; nothing was done. */
  | { status: "locked"; message: string }
  /** Scheduled run already happened today (checked again once the lock is held). */
  | { status: "skipped"; message: string };

export interface RunAndRecordOptions {
  trigger: BillingRunTrigger;
  userId?: number | null;
  /** Clock for the run; defaults to now. Billing runs up to this India calendar day. */
  now?: Date;
  /** Scheduler only: skip when a SCHEDULED run already started today (re-checked under the lock). */
  onlyIfDue?: boolean;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function duration(startedAt: Date, finishedAt: Date) {
  return `${((finishedAt.getTime() - startedAt.getTime()) / 1000).toFixed(1)}s`;
}

function logRun(id: number, trigger: BillingRunTrigger, summary: BillingRunSummary) {
  console.info(
    `[billing] ${trigger.toLowerCase()} run #${id}: ${summary.invoicesCreated} invoices, ${summary.activated} activated, ` +
      `${summary.skippedDuplicates} already billed, ${summary.closed} closed, ${summary.errors.length} errors ` +
      `(${duration(new Date(summary.startedAt), new Date(summary.finishedAt))})`,
  );
}

/** The billing run itself, recorded start to finish. Call only while holding the lock. */
async function recordRun(trigger: BillingRunTrigger, userId: number | null, now: Date): Promise<BillingJobResult> {
  const run = await db.billingRun.create({
    data: { trigger, triggeredById: userId, startedAt: new Date() },
    select: { id: true },
  });

  let summary: BillingRunSummary;
  try {
    summary = await runBilling({ today: businessDay(now) });
  } catch (err) {
    const errors: StoredBillingError[] = [{ subscriptionNumber: "billing run", message: errorMessage(err) }];
    await db.billingRun
      .update({ where: { id: run.id }, data: { finishedAt: new Date(), errorCount: 1, errors: errors as unknown as Prisma.InputJsonValue } })
      .catch(() => {});
    console.error(`[billing] ${trigger.toLowerCase()} run #${run.id} failed: ${errorMessage(err)}`);
    throw err;
  }

  const stored: StoredBillingError[] = summary.errors
    .slice(0, MAX_STORED_ERRORS)
    .map((e) => ({ subscriptionNumber: e.subscriptionNumber, message: e.message.slice(0, 500) }));

  await db.billingRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(summary.finishedAt),
      activated: summary.activated,
      invoicesCreated: summary.invoicesCreated,
      skippedDuplicates: summary.skippedDuplicates,
      closed: summary.closed,
      errorCount: summary.errors.length,
      errors: stored.length > 0 ? (stored as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });

  logRun(run.id, trigger, summary);
  return { status: "completed", runId: run.id, summary };
}

/**
 * Run billing under the global lock and store the result as a BillingRun.
 * Returns `{ status: "locked" }` straight away if another run is in progress.
 */
export async function runAndRecordBilling({
  trigger,
  userId = null,
  now = new Date(),
  onlyIfDue = false,
}: RunAndRecordOptions): Promise<BillingJobResult> {
  return db.$transaction(
    async (lock) => {
      const [row] = await lock.$queryRaw<{ acquired: bigint | number | null }[]>`
        SELECT GET_LOCK(${BILLING_LOCK_NAME}, 0) AS acquired`;
      if (Number(row?.acquired) !== 1) return { status: "locked", message: BILLING_IN_PROGRESS_MESSAGE };

      try {
        if (onlyIfDue) {
          const last = await db.billingRun.findFirst({
            where: { trigger: "SCHEDULED" },
            orderBy: { startedAt: "desc" },
            select: { startedAt: true },
          });
          if (!shouldRunScheduledBilling(now, last?.startedAt ?? null)) {
            return { status: "skipped", message: "Today's scheduled billing run has already happened." };
          }
        }
        return await recordRun(trigger, userId, now);
      } finally {
        await lock.$queryRaw`SELECT RELEASE_LOCK(${BILLING_LOCK_NAME})`.catch((err: unknown) => {
          console.error(`[billing] could not release the billing lock: ${errorMessage(err)}`);
        });
      }
    },
    { maxWait: 10_000, timeout: LOCK_HOLD_TIMEOUT_MS },
  );
}

// ───────────────────────────── Reading runs back ─────────────────────────────

/** The stored `errors` JSON as a typed list (tolerates anything unexpected). */
export function storedErrors(value: Prisma.JsonValue | null): StoredBillingError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const { subscriptionNumber, message } = item as Record<string, unknown>;
    return typeof message === "string" ? [{ subscriptionNumber: String(subscriptionNumber ?? ""), message }] : [];
  });
}

/** What the invoices page "last run" panel shows. Plain data, safe to pass to a client component. */
export interface LastBillingRun {
  trigger: BillingRunTrigger;
  /** India calendar day the run billed up to (YYYY-MM-DD). */
  today: string;
  finishedAt: string;
  activated: number;
  invoicesCreated: number;
  skippedDuplicates: number;
  closed: number;
  errorCount: number;
  errors: StoredBillingError[];
}

/** The most recent finished billing run, from the database. */
export async function getLatestBillingRun(): Promise<LastBillingRun | null> {
  const run = await db.billingRun.findFirst({
    where: { finishedAt: { not: null } },
    orderBy: { startedAt: "desc" },
  });
  if (!run?.finishedAt) return null;
  return {
    trigger: run.trigger,
    today: businessDay(run.startedAt).toISOString().slice(0, 10),
    finishedAt: run.finishedAt.toISOString(),
    activated: run.activated,
    invoicesCreated: run.invoicesCreated,
    skippedDuplicates: run.skippedDuplicates,
    closed: run.closed,
    errorCount: run.errorCount,
    errors: storedErrors(run.errors),
  };
}
