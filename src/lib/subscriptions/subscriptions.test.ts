import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  RENEWAL_TERMS,
  canPause,
  canRenew,
  defaultRenewalTerm,
  isRenewalTerm,
  renewedExpiryDate,
  resumeNextInvoiceDate,
} from "./subscriptions";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("resumeNextInvoiceDate", () => {
  const today = d("2026-10-31");

  it("bills from today when the next invoice date passed while paused (no back-billing)", () => {
    assert.equal(iso(resumeNextInvoiceDate(d("2026-08-01"), today)), "2026-10-31");
  });

  it("keeps a next invoice date that is still in the future", () => {
    assert.equal(iso(resumeNextInvoiceDate(d("2026-11-15"), today)), "2026-11-15");
  });

  it("keeps today when the next invoice is due today", () => {
    assert.equal(iso(resumeNextInvoiceDate(d("2026-10-31"), today)), "2026-10-31");
  });

  it("starts from today when there is no next invoice date", () => {
    assert.equal(iso(resumeNextInvoiceDate(null, today)), "2026-10-31");
  });
});

describe("renewedExpiryDate", () => {
  it("adds the chosen length in calendar months", () => {
    const expiry = d("2027-01-15");
    assert.equal(iso(renewedExpiryDate(expiry, "1m")), "2027-02-15");
    assert.equal(iso(renewedExpiryDate(expiry, "3m")), "2027-04-15");
    assert.equal(iso(renewedExpiryDate(expiry, "6m")), "2027-07-15");
    assert.equal(iso(renewedExpiryDate(expiry, "1y")), "2028-01-15");
  });

  it("adds exactly the chosen length on every repeat renewal (no doubling)", () => {
    let expiry = d("2027-01-15");
    const seen: string[] = [];
    for (let i = 0; i < 3; i++) {
      expiry = renewedExpiryDate(expiry, "1y");
      seen.push(iso(expiry));
    }
    assert.deepEqual(seen, ["2028-01-15", "2029-01-15", "2030-01-15"]);

    expiry = d("2026-11-10");
    expiry = renewedExpiryDate(expiry, "3m");
    expiry = renewedExpiryDate(expiry, "3m");
    assert.equal(iso(expiry), "2027-05-10");
  });

  it("clamps to the end of a shorter month", () => {
    assert.equal(iso(renewedExpiryDate(d("2027-01-31"), "1m")), "2027-02-28");
    assert.equal(iso(renewedExpiryDate(d("2027-08-31"), "6m")), "2028-02-29");
    assert.equal(iso(renewedExpiryDate(d("2028-02-29"), "1y")), "2029-02-28");
    assert.equal(iso(renewedExpiryDate(d("2026-05-31"), "3m")), "2026-08-31");
  });

  it("ignores the time of day", () => {
    assert.equal(iso(renewedExpiryDate(new Date("2027-01-15T18:30:00Z"), "1y")), "2028-01-15");
  });
});

describe("renewal terms", () => {
  it("suggests a year for yearly plans and a month otherwise", () => {
    assert.equal(defaultRenewalTerm("YEARLY"), "1y");
    assert.equal(defaultRenewalTerm("MONTHLY"), "1m");
    assert.equal(defaultRenewalTerm("WEEKLY"), "1m");
    assert.equal(defaultRenewalTerm("DAILY"), "1m");
  });

  it("accepts only the listed options", () => {
    for (const term of RENEWAL_TERMS) assert.equal(isRenewalTerm(term), true);
    assert.equal(isRenewalTerm("2y"), false);
    assert.equal(isRenewalTerm(12), false);
    assert.equal(isRenewalTerm(undefined), false);
  });
});

describe("canPause / canRenew", () => {
  it("pauses only active subscriptions on pausable plans", () => {
    assert.equal(canPause("ACTIVE", true), true);
    assert.equal(canPause("ACTIVE", false), false);
    assert.equal(canPause("PAUSED", true), false);
    assert.equal(canPause("CONFIRMED", true), false);
  });

  it("renews active or paused subscriptions with an expiry date on renewable plans", () => {
    const expiry = d("2027-01-01");
    assert.equal(canRenew("ACTIVE", true, expiry), true);
    assert.equal(canRenew("PAUSED", true, expiry), true);
    assert.equal(canRenew("ACTIVE", false, expiry), false);
    assert.equal(canRenew("ACTIVE", true, null), false);
    assert.equal(canRenew("CLOSED", true, expiry), false);
    assert.equal(canRenew("CONFIRMED", true, expiry), false);
  });
});
