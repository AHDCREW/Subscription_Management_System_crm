import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  dueDateFor,
  formatInvoiceNumber,
  invoiceLineDescription,
  isInvoiceOverdue,
  lastDayOfPeriod,
  outstandingAmount,
  startOfTomorrow,
  toDiscountRule,
} from "./index";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (date: Date) => date.toISOString().slice(0, 10);

describe("invoice numbers", () => {
  it("pads the id after the company tag", () => {
    assert.equal(formatInvoiceNumber("INV", 1), "INV-00001");
    assert.equal(formatInvoiceNumber("BL", 4321), "BL-04321");
    assert.equal(formatInvoiceNumber("INV", 123456), "INV-123456");
  });

  it("falls back to INV for a missing or blank tag", () => {
    assert.equal(formatInvoiceNumber(null, 7), "INV-00007");
    assert.equal(formatInvoiceNumber("  ", 7), "INV-00007");
    assert.equal(formatInvoiceNumber(" ACME ", 7), "ACME-00007");
  });

  it("fits the 20 character column with a 10 character tag", () => {
    assert.ok(formatInvoiceNumber("ABCDEFGHIJ", 999_999_999).length <= 20);
  });
});

describe("invoice dates", () => {
  it("adds payment terms to the invoice date", () => {
    assert.equal(iso(dueDateFor(d("2026-10-01"), 0)), "2026-10-01");
    assert.equal(iso(dueDateFor(d("2026-10-01"), 15)), "2026-10-16");
    assert.equal(iso(dueDateFor(d("2026-12-20"), 30)), "2027-01-19");
    assert.equal(iso(dueDateFor(d("2026-10-01"), -5)), "2026-10-01");
  });

  it("shows the last covered day of an exclusive period end", () => {
    assert.equal(iso(lastDayOfPeriod(d("2026-11-01"))), "2026-10-31");
    assert.equal(iso(lastDayOfPeriod(d("2028-03-01"))), "2028-02-29");
  });

  it("computes the start of tomorrow in UTC", () => {
    assert.equal(startOfTomorrow(new Date("2026-10-31T23:59:59Z")).toISOString(), "2026-11-01T00:00:00.000Z");
  });
});

describe("invoice lines", () => {
  it("prefers the line's own description", () => {
    assert.equal(invoiceLineDescription({ description: " Custom ", productName: "CRM" }), "Custom");
  });

  it("falls back to product name and variant", () => {
    assert.equal(invoiceLineDescription({ description: null, productName: "CRM" }), "CRM");
    assert.equal(
      invoiceLineDescription({ description: "", productName: "CRM", variant: { attribute: "Brand", value: "Odoo" } }),
      "CRM (Brand: Odoo)",
    );
  });
});

describe("overdue and outstanding", () => {
  const today = d("2026-10-31");
  const base = { status: "CONFIRMED" as const, dueDate: d("2026-10-30"), total: "1180.00", amountPaid: "0" };

  it("computes the outstanding amount", () => {
    assert.equal(outstandingAmount("1180.00", "180.10"), 999.9);
    assert.equal(outstandingAmount(100, 150), 0);
  });

  it("flags confirmed, unpaid invoices past their due date", () => {
    assert.equal(isInvoiceOverdue(base, today), true);
    assert.equal(isInvoiceOverdue({ ...base, amountPaid: "500" }, today), true);
  });

  it("is not overdue on the due date itself, when paid, or when not confirmed", () => {
    assert.equal(isInvoiceOverdue({ ...base, dueDate: today }, new Date("2026-10-31T20:00:00Z")), false);
    assert.equal(isInvoiceOverdue({ ...base, amountPaid: "1180" }, today), false);
    assert.equal(isInvoiceOverdue({ ...base, status: "DRAFT" }, today), false);
    assert.equal(isInvoiceOverdue({ ...base, status: "PAID" }, today), false);
    assert.equal(isInvoiceOverdue({ ...base, status: "CANCELLED" }, today), false);
  });
});

describe("discount rows", () => {
  it("converts decimals and product links", () => {
    const row = {
      id: 3,
      type: "PERCENTAGE" as const,
      value: "12.50",
      scope: "PRODUCTS" as const,
      minPurchase: null as string | null,
      minQuantity: 2,
      startDate: null,
      endDate: d("2026-12-31"),
      usageLimit: 10,
      usedCount: 4,
      active: true,
      products: [{ productId: 7 }, { productId: 9 }],
    };
    const rule = toDiscountRule(row);
    assert.equal(rule.value, 12.5);
    assert.equal(rule.minPurchase, null);
    assert.deepEqual(rule.productIds, [7, 9]);
    assert.equal(toDiscountRule({ ...row, minPurchase: "500" }).minPurchase, 500);
  });
});
