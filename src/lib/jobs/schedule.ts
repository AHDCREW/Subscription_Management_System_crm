// Pure date helpers for the daily billing scheduler. No database or framework
// code here, so the "should it run now?" decision is unit-tested directly.
//
// The business runs on India time. Asia/Kolkata has a fixed UTC+05:30 offset
// (no daylight saving), so a constant offset is exact.

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
const OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The scheduled run happens on the first check after this time of day (India time). */
export const SCHEDULED_RUN_AFTER_MINUTES = 5; // 00:05

/** How often the scheduler checks whether today's run is due. */
export const SCHEDULER_CHECK_INTERVAL_MS = 15 * 60 * 1000;

/** Today's calendar day in India as a UTC-midnight date (the form billing dates use). */
export function businessDay(now: Date): Date {
  const local = new Date(now.getTime() + OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** The instant today's India day began (00:00 Asia/Kolkata). */
export function startOfBusinessDay(now: Date): Date {
  return new Date(businessDay(now).getTime() - OFFSET_MS);
}

/** Minutes since local midnight in India (0–1439). */
export function businessMinuteOfDay(now: Date): number {
  return Math.floor(((now.getTime() + OFFSET_MS) % DAY_MS) / 60000);
}

/**
 * Should the scheduler start today's run now? Yes when it is past 00:05 India
 * time and no scheduled run has started since today's India midnight.
 */
export function shouldRunScheduledBilling(now: Date, lastScheduledStartedAt: Date | null): boolean {
  if (businessMinuteOfDay(now) < SCHEDULED_RUN_AFTER_MINUTES) return false;
  if (!lastScheduledStartedAt) return true;
  return lastScheduledStartedAt.getTime() < startOfBusinessDay(now).getTime();
}
