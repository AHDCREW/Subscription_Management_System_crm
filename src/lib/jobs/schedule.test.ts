import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { businessDay, businessMinuteOfDay, shouldRunScheduledBilling, startOfBusinessDay } from "./schedule";

// India time is UTC+05:30: 00:05 IST on 1 Nov 2026 is 18:35 UTC on 31 Oct.
const at = (iso: string) => new Date(iso);
const day = (date: Date) => date.toISOString().slice(0, 10);

describe("business day (Asia/Kolkata)", () => {
  it("rolls over at India midnight, not UTC midnight", () => {
    assert.equal(day(businessDay(at("2026-10-31T18:29:00Z"))), "2026-10-31"); // 23:59 IST
    assert.equal(day(businessDay(at("2026-10-31T18:30:00Z"))), "2026-11-01"); // 00:00 IST
    assert.equal(day(businessDay(at("2026-11-01T02:00:00Z"))), "2026-11-01"); // 07:30 IST
  });

  it("starts the day at 00:00 IST", () => {
    assert.equal(startOfBusinessDay(at("2026-11-01T02:00:00Z")).toISOString(), "2026-10-31T18:30:00.000Z");
    assert.equal(startOfBusinessDay(at("2026-10-31T18:30:00Z")).toISOString(), "2026-10-31T18:30:00.000Z");
  });

  it("counts minutes from India midnight", () => {
    assert.equal(businessMinuteOfDay(at("2026-10-31T18:30:00Z")), 0);
    assert.equal(businessMinuteOfDay(at("2026-10-31T18:35:00Z")), 5);
    assert.equal(businessMinuteOfDay(at("2026-10-31T18:29:59Z")), 1439);
  });
});

describe("shouldRunScheduledBilling", () => {
  const yesterdayRun = at("2026-10-30T18:40:00Z"); // 00:10 IST on 31 Oct

  it("waits until 00:05 India time", () => {
    assert.equal(shouldRunScheduledBilling(at("2026-10-31T18:30:00Z"), yesterdayRun), false); // 00:00
    assert.equal(shouldRunScheduledBilling(at("2026-10-31T18:34:59Z"), yesterdayRun), false); // 00:04:59
    assert.equal(shouldRunScheduledBilling(at("2026-10-31T18:35:00Z"), yesterdayRun), true); // 00:05
  });

  it("runs when there has never been a scheduled run", () => {
    assert.equal(shouldRunScheduledBilling(at("2026-11-01T06:00:00Z"), null), true);
  });

  it("runs once per India day", () => {
    const todayRun = at("2026-10-31T18:36:00Z"); // 00:06 IST on 1 Nov
    assert.equal(shouldRunScheduledBilling(at("2026-10-31T18:50:00Z"), todayRun), false);
    assert.equal(shouldRunScheduledBilling(at("2026-11-01T17:00:00Z"), todayRun), false); // 22:30 IST same day
    assert.equal(shouldRunScheduledBilling(at("2026-11-01T18:35:00Z"), todayRun), true); // next day 00:05
  });

  it("catches up later in the day if the server was down at 00:05", () => {
    assert.equal(shouldRunScheduledBilling(at("2026-11-01T09:00:00Z"), yesterdayRun), true); // 14:30 IST
  });

  it("treats a run that started on the previous UTC day but the same India day as today's", () => {
    // 18:31 UTC on 31 Oct is 00:01 IST on 1 Nov: still today in India.
    assert.equal(shouldRunScheduledBilling(at("2026-11-01T03:00:00Z"), at("2026-10-31T18:31:00Z")), false);
  });
});
