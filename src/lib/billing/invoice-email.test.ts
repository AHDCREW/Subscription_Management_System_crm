import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatDate, formatMoney } from "../money";
import {
  buildInvoiceEmail,
  buildReminderEmail,
  canSendInvoice,
  daysOverdue,
  EMAIL_LINE_LIMIT,
  type InvoiceEmailInput,
} from "./invoice-email";

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
const inr = (value: number) => formatMoney(value, "INR");

const base: InvoiceEmailInput = {
  number: "INV-00042",
  status: "CONFIRMED",
  companyName: "Brightloop Software",
  currency: "INR",
  customerName: "Asha Mehta",
  invoiceDate: d("2026-10-01"),
  dueDate: d("2026-10-16"),
  periodStart: d("2026-10-01"),
  periodEnd: d("2026-11-01"),
  total: "1180.00",
  amountPaid: "180.00",
  lines: [
    { description: "Pro plan", quantity: 1, amount: "1000.00", discountAmount: "0", taxAmount: "180.00" },
  ],
  portalUrl: "https://app.example.com/portal/invoices/42",
};

describe("who gets an email", () => {
  it("sends confirmed and paid invoices only", () => {
    assert.equal(canSendInvoice("CONFIRMED"), true);
    assert.equal(canSendInvoice("PAID"), true);
    assert.equal(canSendInvoice("DRAFT"), false);
    assert.equal(canSendInvoice("CANCELLED"), false);
  });

  it("counts calendar days overdue", () => {
    assert.equal(daysOverdue(d("2026-10-16"), new Date("2026-10-31T22:00:00Z")), 15);
    assert.equal(daysOverdue(d("2026-10-30"), d("2026-10-31")), 1);
    assert.equal(daysOverdue(d("2026-10-31"), d("2026-10-31")), 0);
    assert.equal(daysOverdue(d("2026-11-05"), d("2026-10-31")), 0);
  });
});

describe("invoice email", () => {
  it("names the invoice and company in the subject", () => {
    assert.equal(buildInvoiceEmail(base).subject, "Invoice INV-00042 from Brightloop Software");
  });

  it("shows the amount due, dates, period, lines, totals and the portal link", () => {
    const { text } = buildInvoiceEmail(base);
    assert.match(text, /^Hi Asha,/);
    assert.ok(text.includes(`The amount due is ${inr(1000)}, payable by ${formatDate(d("2026-10-16"))}.`));
    assert.ok(text.includes(`Period:         ${formatDate(d("2026-10-01"))} – ${formatDate(d("2026-10-31"))}`));
    assert.ok(text.includes(`  - Pro plan: ${inr(1180)}`));
    assert.ok(text.includes(`Total:       ${inr(1180)}`));
    assert.ok(text.includes(`Paid:        ${inr(180)}`));
    assert.ok(text.includes(`Balance due: ${inr(1000)}`));
    assert.ok(text.includes("View and pay the invoice online: https://app.example.com/portal/invoices/42"));
  });

  it("thanks the customer instead of asking for money when paid", () => {
    const { text } = buildInvoiceEmail({ ...base, status: "PAID", amountPaid: "1180.00" });
    assert.ok(text.includes("paid in full"));
    assert.ok(!text.includes("amount due"));
    assert.ok(text.includes("View the invoice online:"));
  });

  it("summarises long invoices and line quantities", () => {
    const line = { description: "Seat", quantity: 3, amount: "300", discountAmount: "30", taxAmount: "0" };
    const { text } = buildInvoiceEmail({ ...base, lines: Array.from({ length: EMAIL_LINE_LIMIT + 2 }, () => line) });
    assert.equal(text.split(`  - Seat × 3: ${inr(270)}`).length - 1, EMAIL_LINE_LIMIT);
    assert.ok(text.includes("  - and 2 more lines"));
  });

  it("skips the period and summary when there are none", () => {
    const { text } = buildInvoiceEmail({ ...base, periodStart: null, periodEnd: null, lines: [] });
    assert.ok(!text.includes("Period:"));
    assert.ok(!text.includes("Summary"));
  });
});

describe("reminder email", () => {
  it("says how late it is, the balance and where to pay", () => {
    const { subject, text } = buildReminderEmail(base, d("2026-10-31"));
    assert.equal(subject, "Reminder: invoice INV-00042 is 15 days overdue");
    assert.ok(text.includes("friendly reminder"));
    assert.ok(text.includes("is now 15 days overdue"));
    assert.ok(text.includes(`The remaining balance is ${inr(1000)}.`));
    assert.ok(text.includes("https://app.example.com/portal/invoices/42"));
  });

  it("uses the singular for one day", () => {
    assert.equal(buildReminderEmail({ ...base, dueDate: d("2026-10-30") }, d("2026-10-31")).subject, "Reminder: invoice INV-00042 is 1 day overdue");
  });
});
