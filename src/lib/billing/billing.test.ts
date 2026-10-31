import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { round2 } from "../money";
import {
  addPeriod,
  allocateDiscount,
  calculateInvoice,
  discountAmount,
  duePeriodStarts,
  duePeriods,
  isDiscountApplicable,
  linePrice,
  monthlyRecurringValue,
  periodEnd,
  pickBestDiscount,
  type CalculatedInvoice,
  type DiscountRule,
  type DiscountableLine,
} from "./index";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

function discount(overrides: Partial<DiscountRule> = {}): DiscountRule {
  return {
    id: 1,
    type: "PERCENTAGE",
    value: 10,
    scope: "SUBSCRIPTION",
    productIds: [],
    minPurchase: null,
    minQuantity: null,
    startDate: null,
    endDate: null,
    usageLimit: null,
    usedCount: 0,
    active: true,
    ...overrides,
  };
}

const sum = (values: number[]) => round2(values.reduce((a, b) => a + b, 0));

function assertConsistent(invoice: CalculatedInvoice) {
  assert.equal(invoice.subtotal, sum(invoice.lines.map((l) => l.amount)));
  assert.equal(invoice.discountTotal, sum(invoice.lines.map((l) => l.discountAmount)));
  assert.equal(invoice.taxTotal, sum(invoice.lines.map((l) => l.taxAmount)));
  assert.equal(invoice.total, round2(invoice.subtotal - invoice.discountTotal + invoice.taxTotal));
  assert.equal(invoice.total, sum(invoice.lines.map((l) => l.total)));
  for (const line of invoice.lines) {
    assert.equal(line.total, round2(line.amount - line.discountAmount + line.taxAmount));
    assert.ok(line.discountAmount >= 0 && line.discountAmount <= line.amount);
  }
}

describe("periods", () => {
  it("clamps month ends", () => {
    assert.equal(iso(addPeriod(d("2026-01-31"), "MONTHLY")), "2026-02-28");
    assert.equal(iso(addPeriod(d("2026-03-31"), "MONTHLY")), "2026-04-30");
    assert.equal(iso(addPeriod(d("2026-01-31"), "MONTHLY", 2)), "2026-03-31");
    assert.equal(iso(addPeriod(d("2026-12-15"), "MONTHLY")), "2027-01-15");
    assert.equal(iso(addPeriod(d("2026-11-30"), "MONTHLY", 14)), "2028-01-30");
  });

  it("handles leap years", () => {
    assert.equal(iso(addPeriod(d("2028-01-31"), "MONTHLY")), "2028-02-29");
    assert.equal(iso(addPeriod(d("2028-02-29"), "YEARLY")), "2029-02-28");
    assert.equal(iso(addPeriod(d("2028-02-29"), "YEARLY", 4)), "2032-02-29");
    assert.equal(iso(addPeriod(d("2028-02-28"), "DAILY")), "2028-02-29");
    assert.equal(iso(addPeriod(d("2026-06-15"), "YEARLY")), "2027-06-15");
  });

  it("adds daily and weekly periods", () => {
    assert.equal(iso(addPeriod(d("2026-12-31"), "DAILY")), "2027-01-01");
    assert.equal(iso(addPeriod(d("2026-10-31"), "DAILY", 3)), "2026-11-03");
    assert.equal(iso(addPeriod(d("2026-12-28"), "WEEKLY")), "2027-01-04");
    assert.equal(iso(addPeriod(d("2026-10-01"), "WEEKLY", 2)), "2026-10-15");
    assert.equal(iso(periodEnd(d("2026-10-01"), "MONTHLY")), "2026-11-01");
  });

  it("uses date-only UTC semantics", () => {
    const late = new Date("2026-01-31T23:59:00Z");
    assert.equal(addPeriod(late, "MONTHLY").toISOString(), "2026-02-28T00:00:00.000Z");
  });
});

describe("due periods", () => {
  it("returns nothing when not yet due", () => {
    assert.deepEqual(duePeriodStarts(d("2026-11-01"), d("2026-10-31"), "MONTHLY"), []);
  });

  it("bills on the period start (in advance)", () => {
    assert.deepEqual(duePeriodStarts(d("2026-10-31"), d("2026-10-31"), "MONTHLY").map(iso), ["2026-10-31"]);
  });

  it("returns one start per missed period, oldest first, with no gaps", () => {
    const starts = duePeriodStarts(d("2026-07-01"), d("2026-10-31"), "MONTHLY").map(iso);
    assert.deepEqual(starts, ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"]);

    const periods = duePeriods(d("2026-10-10"), d("2026-10-31"), "WEEKLY");
    assert.deepEqual(periods.map((p) => iso(p.start)), ["2026-10-10", "2026-10-17", "2026-10-24", "2026-10-31"]);
    for (let i = 1; i < periods.length; i++) assert.equal(iso(periods[i].start), iso(periods[i - 1].end));
  });

  it("stops at the expiry date", () => {
    const starts = duePeriodStarts(d("2026-07-01"), d("2026-10-31"), "MONTHLY", d("2026-09-01")).map(iso);
    assert.deepEqual(starts, ["2026-07-01", "2026-08-01"]);
    const mid = duePeriodStarts(d("2026-07-01"), d("2026-10-31"), "MONTHLY", d("2026-09-15")).map(iso);
    assert.deepEqual(mid, ["2026-07-01", "2026-08-01", "2026-09-01"]);
    assert.deepEqual(duePeriodStarts(d("2026-07-01"), d("2026-10-31"), "MONTHLY", null).length, 4);
  });

  it("caps runaway loops", () => {
    assert.equal(duePeriodStarts(d("2000-01-01"), d("2026-10-31"), "DAILY").length, 120);
    assert.equal(duePeriodStarts(d("2000-01-01"), d("2026-10-31"), "DAILY", null, 5).length, 5);
  });
});

describe("monthly recurring value", () => {
  it("normalises each period to a month", () => {
    assert.equal(monthlyRecurringValue(1200, "YEARLY"), 100);
    assert.equal(monthlyRecurringValue(500, "MONTHLY"), 500);
    assert.equal(monthlyRecurringValue(120, "WEEKLY"), 520);
    assert.equal(monthlyRecurringValue(12, "DAILY"), 365);
  });
});

describe("invoice lines", () => {
  it("prices the Odoo variant: 999 + 560 = 1559 per unit", () => {
    const unitPrice = linePrice(999, 560);
    assert.equal(unitPrice, 1559);
    const invoice = calculateInvoice({
      lines: [{ productId: 7, description: "Brightloop CRM (Brand: Odoo)", quantity: 2, unitPrice }],
      planPrice: 0,
      planName: "Monthly",
      discounts: [],
      on: d("2026-10-31"),
    });
    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].amount, 3118);
    assert.equal(invoice.subtotal, 3118);
    assert.equal(invoice.total, 3118);
    assert.equal(invoice.appliedDiscountId, null);
    assertConsistent(invoice);
  });

  it("adds the plan price as a base-fee line only when > 0", () => {
    const invoice = calculateInvoice({
      lines: [{ productId: 1, description: "CRM", quantity: 1, unitPrice: 100 }],
      planPrice: 49.99,
      planName: "Pro Monthly",
      discounts: [],
      on: d("2026-10-31"),
    });
    assert.equal(invoice.lines.length, 2);
    assert.deepEqual(
      { productId: invoice.lines[0].productId, description: invoice.lines[0].description, quantity: invoice.lines[0].quantity },
      { productId: null, description: "Pro Monthly", quantity: 1 },
    );
    assert.equal(invoice.subtotal, 149.99);
    assertConsistent(invoice);
  });

  it("applies 18% GST after the discount", () => {
    const invoice = calculateInvoice({
      lines: [{ productId: 1, description: "CRM", quantity: 2, unitPrice: 500, taxRate: 18 }],
      planPrice: 0,
      planName: "Monthly",
      discounts: [discount({ type: "PERCENTAGE", value: 10 })],
      on: d("2026-10-31"),
    });
    const [line] = invoice.lines;
    assert.equal(line.amount, 1000);
    assert.equal(line.discountAmount, 100);
    assert.equal(line.taxAmount, 162); // (1000 - 100) × 18%
    assert.equal(line.total, 1062);
    assert.equal(invoice.total, 1062);
    assertConsistent(invoice);
  });

  it("keeps totals consistent with mixed taxes, odd prices and a discount", () => {
    const invoice = calculateInvoice({
      lines: [
        { productId: 1, description: "A", quantity: 3, unitPrice: 33.33, taxRate: 18 },
        { productId: 2, description: "B", quantity: 7, unitPrice: 0.99, taxRate: 5 },
        { productId: 3, description: "C", quantity: 1, unitPrice: 1559, taxRate: 12 },
        { productId: 4, description: "D", quantity: 1, unitPrice: 0 },
      ],
      planPrice: 199.9,
      planName: "Base",
      planTaxRate: 18,
      discounts: [discount({ type: "FIXED", value: 77.77 })],
      on: d("2026-10-31"),
    });
    assert.equal(invoice.discountTotal, 77.77);
    assert.equal(invoice.lines[4].discountAmount, 0);
    assertConsistent(invoice);
  });
});

describe("discounts", () => {
  const lines: DiscountableLine[] = [
    { productId: null, quantity: 1, amount: 100 },
    { productId: 1, quantity: 2, amount: 400 },
    { productId: 2, quantity: 3, amount: 300 },
  ];
  const on = d("2026-10-31");

  it("computes percentage discounts on the eligible subtotal", () => {
    assert.equal(discountAmount(discount({ value: 10 }), lines), 80);
    assert.equal(discountAmount(discount({ value: 12.5, scope: "PRODUCTS", productIds: [2] }), lines), 37.5);
  });

  it("caps fixed discounts at the eligible subtotal", () => {
    assert.equal(discountAmount(discount({ type: "FIXED", value: 50 }), lines), 50);
    assert.equal(discountAmount(discount({ type: "FIXED", value: 5000 }), lines), 800);
    assert.equal(discountAmount(discount({ type: "FIXED", value: 5000, scope: "PRODUCTS", productIds: [2] }), lines), 300);
  });

  it("only discounts matching lines for PRODUCTS scope", () => {
    const invoice = calculateInvoice({
      lines: [
        { productId: 1, description: "CRM", quantity: 2, unitPrice: 200 },
        { productId: 2, description: "Storage", quantity: 3, unitPrice: 100 },
      ],
      planPrice: 100,
      planName: "Plan",
      discounts: [discount({ value: 20, scope: "PRODUCTS", productIds: [2] })],
      on,
    });
    assert.deepEqual(invoice.lines.map((l) => l.discountAmount), [0, 0, 60]);
    assert.equal(invoice.discountTotal, 60);
    assertConsistent(invoice);
  });

  it("is not applicable without matching products", () => {
    assert.equal(isDiscountApplicable(discount({ scope: "PRODUCTS", productIds: [99] }), { lines, on }), false);
  });

  it("rejects inactive discounts", () => {
    assert.equal(isDiscountApplicable(discount({ active: false }), { lines, on }), false);
  });

  it("checks minimum quantity against eligible lines", () => {
    assert.equal(isDiscountApplicable(discount({ minQuantity: 6 }), { lines, on }), true); // 1 + 2 + 3
    assert.equal(isDiscountApplicable(discount({ minQuantity: 7 }), { lines, on }), false);
    const products = { scope: "PRODUCTS" as const, productIds: [1] };
    assert.equal(isDiscountApplicable(discount({ ...products, minQuantity: 2 }), { lines, on }), true);
    assert.equal(isDiscountApplicable(discount({ ...products, minQuantity: 3 }), { lines, on }), false);
  });

  it("checks minimum purchase against the eligible subtotal", () => {
    assert.equal(isDiscountApplicable(discount({ minPurchase: 800 }), { lines, on }), true);
    assert.equal(isDiscountApplicable(discount({ minPurchase: 800.01 }), { lines, on }), false);
    const products = { scope: "PRODUCTS" as const, productIds: [2] };
    assert.equal(isDiscountApplicable(discount({ ...products, minPurchase: 300 }), { lines, on }), true);
    assert.equal(isDiscountApplicable(discount({ ...products, minPurchase: 400 }), { lines, on }), false);
  });

  it("checks the date window inclusively by date", () => {
    const check = (startDate: Date | null, endDate: Date | null) =>
      isDiscountApplicable(discount({ startDate, endDate }), { lines, on });
    assert.equal(check(d("2026-10-31"), d("2026-10-31")), true);
    assert.equal(check(new Date("2026-10-31T18:00:00Z"), new Date("2026-10-31T01:00:00Z")), true);
    assert.equal(check(d("2026-11-01"), null), false);
    assert.equal(check(null, d("2026-10-30")), false);
    assert.equal(check(d("2026-01-01"), d("2026-12-31")), true);
  });

  it("stops at the usage limit", () => {
    assert.equal(isDiscountApplicable(discount({ usageLimit: 3, usedCount: 2 }), { lines, on }), true);
    assert.equal(isDiscountApplicable(discount({ usageLimit: 3, usedCount: 3 }), { lines, on }), false);
    assert.equal(isDiscountApplicable(discount({ usageLimit: 0, usedCount: 0 }), { lines, on }), false);
    assert.equal(isDiscountApplicable(discount({ usageLimit: null, usedCount: 999 }), { lines, on }), true);
  });

  it("picks the single best discount (no stacking)", () => {
    const pct = discount({ id: 1, value: 10 }); // 80
    const fixed = discount({ id: 2, type: "FIXED", value: 120 }); // 120
    const expired = discount({ id: 3, type: "FIXED", value: 500, endDate: d("2026-01-01") });
    const best = pickBestDiscount([pct, fixed, expired], { lines, on });
    assert.equal(best?.discount.id, 2);
    assert.equal(best?.amount, 120);
    assert.equal(sum(best?.allocations ?? []), 120);
    assert.equal(pickBestDiscount([expired], { lines, on }), null);
    assert.equal(pickBestDiscount([], { lines, on }), null);
  });

  it("prefers the pinned discount when it applies", () => {
    const pct = discount({ id: 1, value: 10 }); // 80
    const fixed = discount({ id: 2, type: "FIXED", value: 120 });
    assert.equal(pickBestDiscount([pct, fixed], { lines, on }, 1)?.discount.id, 1);
    const pinnedUsedUp = discount({ id: 1, value: 10, usageLimit: 1, usedCount: 1 });
    assert.equal(pickBestDiscount([pinnedUsedUp, fixed], { lines, on }, 1)?.discount.id, 2);
    assert.equal(pickBestDiscount([pct, fixed], { lines, on }, 42)?.discount.id, 2);
  });

  it("uses the pinned discount through calculateInvoice", () => {
    const invoice = calculateInvoice({
      lines: [{ productId: 1, description: "CRM", quantity: 1, unitPrice: 1000 }],
      planPrice: 0,
      planName: "Plan",
      discounts: [discount({ id: 1, value: 50 }), discount({ id: 2, type: "FIXED", value: 10 })],
      pinnedDiscountId: 2,
      on,
    });
    assert.equal(invoice.appliedDiscountId, 2);
    assert.equal(invoice.discountTotal, 10);
    assertConsistent(invoice);
  });

  it("allocates proportionally and sums exactly", () => {
    const three: DiscountableLine[] = [
      { productId: 1, quantity: 1, amount: 100 },
      { productId: 2, quantity: 1, amount: 100 },
      { productId: 3, quantity: 1, amount: 100.01 },
    ];
    const rule = discount({ type: "FIXED", value: 100 });
    const allocations = allocateDiscount(rule, three, 100);
    assert.equal(sum(allocations), 100);
    assert.deepEqual(allocations, [33.33, 33.33, 33.34]); // remainder on the largest line

    const proportional = allocateDiscount(rule, lines, 80);
    assert.deepEqual(proportional, [10, 40, 30]);

    for (const amount of [0.01, 0.07, 1, 13.37, 99.99, 333.33, 799.99, 800]) {
      const shares = allocateDiscount(rule, lines, amount);
      assert.equal(sum(shares), amount, `allocation of ${amount}`);
      shares.forEach((share, i) => assert.ok(share >= 0 && share <= lines[i].amount));
    }
  });

  it("never allocates more than a line's amount", () => {
    const tiny: DiscountableLine[] = [
      { productId: 1, quantity: 1, amount: 0.01 },
      { productId: 2, quantity: 1, amount: 0.01 },
      { productId: 3, quantity: 1, amount: 0.01 },
    ];
    const shares = allocateDiscount(discount({ type: "FIXED", value: 0.03 }), tiny, 0.03);
    assert.deepEqual(shares, [0.01, 0.01, 0.01]);
  });
});
