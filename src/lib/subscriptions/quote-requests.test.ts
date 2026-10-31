import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  MAX_OPEN_REQUESTS,
  REQUEST_MAX_LINES,
  checkQuoteRequest,
  isOpenRequest,
  requestsLeft,
  type RequestLineInput,
  type RequestPlan,
  type RequestProduct,
} from "./quote-requests";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const today = d("2026-10-31");

const monthly: RequestPlan = { name: "Monthly", active: true, minQuantity: 1, startDate: null, endDate: null };

const crm: RequestProduct = {
  id: 1,
  name: "Brightloop CRM",
  active: true,
  salesPrice: "999.00",
  taxId: 7,
  tax: { active: true },
  variants: [
    { id: 11, attribute: "Brand", value: "Odoo", extraPrice: "560.00" },
    { id: 12, attribute: "Brand", value: "Standard", extraPrice: "0.00" },
  ],
};
const storage: RequestProduct = {
  id: 2,
  name: "Extra Storage",
  active: true,
  salesPrice: 149.5,
  taxId: null,
  tax: null,
  variants: [],
};

const line = (patch: Partial<RequestLineInput> = {}): RequestLineInput => ({
  key: "0",
  productId: 1,
  variantId: null,
  quantity: 1,
  ...patch,
});

const check = (patch: Partial<Parameters<typeof checkQuoteRequest>[0]> = {}) =>
  checkQuoteRequest({ plan: monthly, startDate: today, lines: [line()], products: [crm, storage], today, ...patch });

describe("checkQuoteRequest pricing", () => {
  it("prices each line from the catalog: sales price plus the variant's extra price", () => {
    const result = check({
      lines: [line({ key: "a", variantId: 11, quantity: 2 }), line({ key: "b", productId: 2, quantity: 3 })],
    });
    assert.ok(result.ok);
    assert.deepEqual(result.lines, [
      { productId: 1, variantId: 11, description: "Brightloop CRM (Brand: Odoo)", quantity: 2, unitPrice: 1559, taxId: 7 },
      { productId: 2, variantId: null, description: "Extra Storage", quantity: 3, unitPrice: 149.5, taxId: null },
    ]);
  });

  it("uses the product's tax only while that tax is active", () => {
    const result = check({ products: [{ ...crm, tax: { active: false } }] });
    assert.ok(result.ok);
    assert.equal(result.lines[0].taxId, null);
  });
});

describe("checkQuoteRequest plan and dates", () => {
  it("refuses a plan that is missing, inactive or not on sale today", () => {
    assert.deepEqual(check({ plan: null }), {
      ok: false,
      fieldErrors: { planId: "That plan is no longer available. Choose another." },
      lineErrors: {},
    });
    for (const plan of [
      { ...monthly, active: false },
      { ...monthly, startDate: d("2026-11-01") },
      { ...monthly, endDate: d("2026-10-30") },
    ]) {
      const result = check({ plan });
      assert.ok(!result.ok);
      assert.equal(result.fieldErrors.planId, "Monthly isn't on sale right now. Choose another plan.");
    }
  });

  it("accepts a plan on its last day of sale", () => {
    assert.ok(check({ plan: { ...monthly, endDate: today } }).ok);
  });

  it("needs the start date inside the plan's sale window", () => {
    const result = check({ plan: { ...monthly, endDate: d("2026-11-30") }, startDate: d("2026-12-01") });
    assert.ok(!result.ok);
    assert.equal(result.fieldErrors.startDate, "Monthly is on sale until 30 Nov 2026. Choose a start date on or before then.");
    assert.equal(result.fieldErrors.planId, undefined);
  });

  it("allows a start date from today up to a year ahead", () => {
    assert.ok(check({ startDate: d("2027-10-31") }).ok);

    const past = check({ startDate: d("2026-10-30") });
    assert.ok(!past.ok);
    assert.equal(past.fieldErrors.startDate, "Choose a start date from today onwards.");

    const tooFar = check({ startDate: d("2027-11-01") });
    assert.ok(!tooFar.ok);
    assert.equal(tooFar.fieldErrors.startDate, "Choose a start date within the next year.");
  });
});

describe("checkQuoteRequest lines", () => {
  it("needs at least one line and at most the line limit", () => {
    const none = check({ lines: [] });
    assert.ok(!none.ok);
    assert.equal(none.fieldErrors.lines, "Add at least one product.");

    const many = check({ lines: Array.from({ length: REQUEST_MAX_LINES + 1 }, (_, i) => line({ key: String(i) })) });
    assert.ok(!many.ok);
    assert.equal(many.fieldErrors.lines, `A request can have at most ${REQUEST_MAX_LINES} lines.`);
  });

  it("refuses missing and inactive products, keyed by row", () => {
    const result = check({
      lines: [line({ key: "gone", productId: 99 }), line({ key: "old", productId: 2 })],
      products: [crm, { ...storage, active: false }],
    });
    assert.deepEqual(result, {
      ok: false,
      fieldErrors: {},
      lineErrors: {
        gone: "This product is no longer available.",
        old: "Extra Storage is no longer sold. Remove this line.",
      },
    });
  });

  it("refuses a variant that belongs to another product", () => {
    const result = check({ lines: [line({ productId: 2, variantId: 11 })] });
    assert.ok(!result.ok);
    assert.equal(result.lineErrors["0"], "That variant isn't available for Extra Storage.");
  });

  it("needs a whole quantity of at least 1", () => {
    for (const quantity of [0, -2, 1.5]) {
      const result = check({ lines: [line({ quantity })] });
      assert.ok(!result.ok);
      assert.equal(result.lineErrors["0"], "Quantity must be at least 1.");
    }
  });

  it("applies the plan's minimum quantity to every line, as the team's form does", () => {
    const teamSeats = { ...monthly, name: "Team Seats", minQuantity: 5 };
    const result = check({ plan: teamSeats, lines: [line({ key: "a", quantity: 4 }), line({ key: "b", quantity: 5 })] });
    assert.ok(!result.ok);
    assert.deepEqual(result.lineErrors, { a: "Team Seats needs a quantity of at least 5 per line." });
  });
});

describe("open requests", () => {
  it("counts only drafts the customer requested", () => {
    assert.equal(isOpenRequest({ status: "DRAFT", requestedAt: today }), true);
    assert.equal(isOpenRequest({ status: "DRAFT", requestedAt: null }), false);
    assert.equal(isOpenRequest({ status: "QUOTATION", requestedAt: today }), false);
  });

  it("leaves room for at most the open-request limit", () => {
    assert.equal(requestsLeft(0), MAX_OPEN_REQUESTS);
    assert.equal(requestsLeft(MAX_OPEN_REQUESTS - 1), 1);
    assert.equal(requestsLeft(MAX_OPEN_REQUESTS), 0);
    assert.equal(requestsLeft(MAX_OPEN_REQUESTS + 2), 0);
  });
});
