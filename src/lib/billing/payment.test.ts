import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { applyPayment, paidPercent, parseIsoDate, paymentBlockedReason, toPaise, validatePayment } from "./index";

const form = (overrides: Partial<{ method: string; amount: string; date: string; note: string }> = {}) => ({
  method: "UPI",
  amount: "500.00",
  date: "2026-10-30",
  note: "",
  ...overrides,
});
const ctx = { balance: "1180.00", today: "2026-10-31" };

describe("toPaise", () => {
  it("rounds money to whole paise", () => {
    assert.equal(toPaise("1180.00"), 118000);
    assert.equal(toPaise(0.1 + 0.2), 30);
    assert.equal(toPaise(null), 0);
  });
});

describe("payment eligibility", () => {
  it("only confirmed invoices with a balance take payments", () => {
    assert.equal(paymentBlockedReason({ status: "CONFIRMED", total: 100, amountPaid: 40 }), null);
    assert.match(paymentBlockedReason({ status: "DRAFT", total: 100, amountPaid: 0 }) ?? "", /draft/);
    assert.match(paymentBlockedReason({ status: "CANCELLED", total: 100, amountPaid: 0 }) ?? "", /cancelled/);
    assert.match(paymentBlockedReason({ status: "PAID", total: 100, amountPaid: 100 }) ?? "", /fully paid/);
    assert.notEqual(paymentBlockedReason({ status: "CONFIRMED", total: 100, amountPaid: 100 }), null);
  });
});

describe("applyPayment", () => {
  it("keeps a partly paid invoice confirmed", () => {
    assert.deepEqual(applyPayment({ total: "1180.00", amountPaid: 0 }, 500), { amountPaid: 500, status: "CONFIRMED" });
  });

  it("marks the invoice paid once the total is covered", () => {
    assert.deepEqual(applyPayment({ total: "1180.00", amountPaid: "500.00" }, "680.00"), {
      amountPaid: 1180,
      status: "PAID",
    });
  });

  it("does not trip on floating point sums", () => {
    // 0.1 + 0.2 !== 0.3 in floats; in paise it does.
    assert.deepEqual(applyPayment({ total: 0.3, amountPaid: 0.1 }, 0.2), { amountPaid: 0.3, status: "PAID" });
  });
});

describe("paidPercent", () => {
  it("is the paid share of the total, clamped to 0–100", () => {
    assert.equal(paidPercent(200, 50), 25);
    assert.equal(paidPercent(200, 0), 0);
    assert.equal(paidPercent(200, 250), 100);
    assert.equal(paidPercent(0, 0), 0);
  });
});

describe("parseIsoDate", () => {
  it("parses real calendar dates as midnight UTC", () => {
    assert.equal(parseIsoDate("2026-02-28")?.toISOString(), "2026-02-28T00:00:00.000Z");
  });

  it("rejects malformed or impossible dates", () => {
    assert.equal(parseIsoDate("2026-02-30"), null);
    assert.equal(parseIsoDate("31/10/2026"), null);
    assert.equal(parseIsoDate(""), null);
  });
});

describe("validatePayment", () => {
  it("accepts a valid payment", () => {
    const result = validatePayment(form({ note: "  Ref 123  " }), ctx);
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.value.method, "UPI");
    assert.equal(result.value.amount, 500);
    assert.equal(result.value.paymentDate.toISOString(), "2026-10-30T00:00:00.000Z");
    assert.equal(result.value.note, "Ref 123");
  });

  it("accepts exactly the balance and today's date", () => {
    const result = validatePayment(form({ amount: "1180", date: "2026-10-31" }), ctx);
    assert.ok(result.ok);
    if (result.ok) assert.equal(result.value.note, null);
  });

  it("refuses more than the balance", () => {
    const result = validatePayment(form({ amount: "1180.01" }), ctx);
    assert.ok(!result.ok && result.fieldErrors.amount);
  });

  it("refuses zero, negative and over-precise amounts", () => {
    for (const amount of ["0", "0.00", "-5", "10.123", "abc", ""]) {
      const result = validatePayment(form({ amount }), ctx);
      assert.ok(!result.ok && result.fieldErrors.amount, `amount ${JSON.stringify(amount)} should be refused`);
    }
  });

  it("refuses DEMO_PAY and unknown methods", () => {
    for (const method of ["DEMO_PAY", "BITCOIN", ""]) {
      const result = validatePayment(form({ method }), ctx);
      assert.ok(!result.ok && result.fieldErrors.method);
    }
  });

  it("refuses future and invalid dates", () => {
    const future = validatePayment(form({ date: "2026-11-01" }), ctx);
    assert.ok(!future.ok && /future/.test(future.fieldErrors.date ?? ""));
    const invalid = validatePayment(form({ date: "2026-13-01" }), ctx);
    assert.ok(!invalid.ok && invalid.fieldErrors.date);
  });

  it("refuses a note over 255 characters", () => {
    const result = validatePayment(form({ note: "x".repeat(256) }), ctx);
    assert.ok(!result.ok && result.fieldErrors.note);
    assert.ok(validatePayment(form({ note: "x".repeat(255) }), ctx).ok);
  });
});
