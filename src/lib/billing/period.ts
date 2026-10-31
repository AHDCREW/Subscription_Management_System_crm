// Billing periods. All dates are treated as calendar dates in UTC: the time of
// day is dropped, so 2026-01-31T18:30Z and 2026-01-31T00:00Z are the same day.

export type BillingPeriod = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

/** Safety cap so a badly stale subscription can't loop forever. */
export const MAX_DUE_PERIODS = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight UTC of the given date (date-only semantics). */
export function toUtcDate(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Compare two dates by calendar day only: negative, 0 or positive. */
export function compareDates(a: Date, b: Date): number {
  return toUtcDate(a).getTime() - toUtcDate(b).getTime();
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const target = date.getUTCMonth() + months;
  const targetYear = year + Math.floor(target / 12);
  const targetMonth = ((target % 12) + 12) % 12;
  // Clamp to the last day of a shorter month: Jan 31 + 1 month = Feb 28/29.
  const day = Math.min(date.getUTCDate(), daysInMonth(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

/** Move a date forward by `count` billing periods (end-of-month clamped). */
export function addPeriod(date: Date, period: BillingPeriod, count = 1): Date {
  const start = toUtcDate(date);
  switch (period) {
    case "DAILY":
      return new Date(start.getTime() + count * DAY_MS);
    case "WEEKLY":
      return new Date(start.getTime() + count * 7 * DAY_MS);
    case "MONTHLY":
      return addMonths(start, count);
    case "YEARLY":
      return addMonths(start, count * 12);
    default: {
      const unknown: never = period;
      throw new Error(`Unknown billing period: ${String(unknown)}`);
    }
  }
}

/** Exclusive end of the period that starts on `start`: [start, end). */
export function periodEnd(start: Date, period: BillingPeriod): Date {
  return addPeriod(start, period);
}

/**
 * Every period start that is due on `today` (billing in advance: a period is
 * invoiced on its first day), oldest first. Periods are chained, so each start
 * is the previous period's end and there are no gaps. A period starting on or
 * after `expiryDate` is not billed.
 */
export function duePeriodStarts(
  nextInvoiceDate: Date,
  today: Date,
  period: BillingPeriod,
  expiryDate?: Date | null,
  maxPeriods = MAX_DUE_PERIODS,
): Date[] {
  const starts: Date[] = [];
  let start = toUtcDate(nextInvoiceDate);
  while (starts.length < maxPeriods && compareDates(start, today) <= 0) {
    if (expiryDate && compareDates(start, expiryDate) >= 0) break;
    starts.push(start);
    start = periodEnd(start, period);
  }
  return starts;
}

/** Due periods as [start, end) pairs; see duePeriodStarts. */
export function duePeriods(
  nextInvoiceDate: Date,
  today: Date,
  period: BillingPeriod,
  expiryDate?: Date | null,
  maxPeriods = MAX_DUE_PERIODS,
): { start: Date; end: Date }[] {
  return duePeriodStarts(nextInvoiceDate, today, period, expiryDate, maxPeriods).map((start) => ({
    start,
    end: periodEnd(start, period),
  }));
}

/** Normalise an amount charged once per period to a monthly value (for MRR). */
export function monthlyRecurringValue(amountPerPeriod: number, period: BillingPeriod): number {
  switch (period) {
    case "DAILY":
      return (amountPerPeriod * 365) / 12;
    case "WEEKLY":
      return (amountPerPeriod * 52) / 12;
    case "MONTHLY":
      return amountPerPeriod;
    case "YEARLY":
      return amountPerPeriod / 12;
    default: {
      const unknown: never = period;
      throw new Error(`Unknown billing period: ${String(unknown)}`);
    }
  }
}
