// Daily billing scheduler, started once per server process from
// src/instrumentation.ts. Every 15 minutes it checks whether today's scheduled
// run (India time, after 00:05) has happened and runs it if not. The check is
// repeated under the billing lock, so several server instances still bill once.
//
// Turn it off with BILLING_SCHEDULER=off.

import { db } from "../db";
import { runAndRecordBilling } from "./billing-job";
import { SCHEDULER_CHECK_INTERVAL_MS, shouldRunScheduledBilling } from "./schedule";

const FIRST_CHECK_DELAY_MS = 30 * 1000;

const state = globalThis as unknown as { __subflowBillingScheduler?: { timer: NodeJS.Timeout; busy: boolean } };

export function billingSchedulerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.BILLING_SCHEDULER ?? "on").trim().toLowerCase() !== "off";
}

async function check() {
  const scheduler = state.__subflowBillingScheduler;
  if (!scheduler || scheduler.busy) return;
  scheduler.busy = true;
  try {
    const now = new Date();
    const last = await db.billingRun.findFirst({
      where: { trigger: "SCHEDULED" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });
    if (!shouldRunScheduledBilling(now, last?.startedAt ?? null)) return;

    const result = await runAndRecordBilling({ trigger: "SCHEDULED", now, onlyIfDue: true });
    // Completed runs log their own summary line; a held lock means another run is busy, try next check.
    if (result.status === "locked") console.info("[billing] scheduled run postponed: another billing run is in progress");
  } catch (err) {
    console.error(`[billing] scheduled run failed: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    scheduler.busy = false;
  }
}

/** Start the scheduler (idempotent: dev reloads and repeated register() calls start it once). */
export function startBillingScheduler() {
  if (!billingSchedulerEnabled()) {
    console.info("[billing] daily scheduler is off (BILLING_SCHEDULER=off)");
    return;
  }
  if (state.__subflowBillingScheduler) return;

  const timer = setInterval(check, SCHEDULER_CHECK_INTERVAL_MS);
  timer.unref();
  state.__subflowBillingScheduler = { timer, busy: false };
  setTimeout(check, FIRST_CHECK_DELAY_MS).unref();
  console.info("[billing] daily scheduler started (runs after 00:05 Asia/Kolkata, checks every 15 min)");
}
