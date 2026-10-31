import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatMoney } from "@/lib/money";
import { buildQuotationEmail, type QuotationEmailInput } from "./quotation-email";

const input: QuotationEmailInput = {
  number: "SUB-00012",
  customerName: "Asha Rao",
  companyName: "Brightloop Software",
  currency: "INR",
  planName: "Growth",
  planPrice: "999.00",
  billingPeriod: "MONTHLY",
  paymentTermDays: 15,
  quotationExpiresAt: new Date("2026-11-30T00:00:00Z"),
  lines: [
    { product: "Analytics seat", variant: "Tier: Pro", quantity: 3, unitPrice: "500.00", taxRate: "18.00" },
    { product: "Onboarding", quantity: 1, unitPrice: 2000 },
  ],
  link: "https://subflow.example/portal/subscriptions/12",
};

describe("buildQuotationEmail", () => {
  const email = buildQuotationEmail(input);

  it("names the quotation and the company in the subject", () => {
    assert.equal(email.subject, "Quotation SUB-00012 from Brightloop Software");
  });

  it("greets the customer and describes the plan and billing period", () => {
    assert.match(email.text, /^Hi Asha Rao,/);
    assert.match(email.text, /Plan: Growth \(Monthly\)/);
    assert.ok(email.html.includes("Hi Asha Rao,"));
  });

  it("lists every line with quantity and unit price", () => {
    assert.ok(email.text.includes(`- Analytics seat (Tier: Pro): 3 x ${formatMoney(500)} = ${formatMoney(1500)}`));
    assert.ok(email.text.includes(`- Onboarding: 1 x ${formatMoney(2000)} = ${formatMoney(2000)}`));
    assert.ok(email.html.includes("Analytics seat (Tier: Pro)"));
  });

  it("shows the base fee, tax and total per period", () => {
    // 999 base fee + 1500 + 2000 products; tax is 18% of 1500 = 270.
    assert.ok(email.text.includes(`Plan base fee: ${formatMoney(999)}`));
    assert.ok(email.text.includes(`Tax: ${formatMoney(270)}`));
    assert.ok(email.text.includes(`Total per month: ${formatMoney(4769)}`));
    assert.ok(email.html.includes(formatMoney(4769)));
  });

  it("includes validity, payment terms, the portal link and the sign-off", () => {
    assert.match(email.text, /Valid until: 30 Nov 2026/);
    assert.match(email.text, /Payment terms: 15 days/);
    assert.ok(email.text.includes(input.link));
    assert.ok(email.html.includes(`href="${input.link}"`));
    assert.match(email.text, /Thank you,\nBrightloop Software$/);
  });

  it("escapes customer data in the HTML", () => {
    const html = buildQuotationEmail({ ...input, customerName: "<b>Eve</b>" }).html;
    assert.ok(!html.includes("<b>Eve</b>"));
    assert.ok(html.includes("&#60;b&#62;Eve"));
  });

  it("handles a quotation with only the plan", () => {
    const only = buildQuotationEmail({ ...input, billingPeriod: "YEARLY", lines: [] });
    assert.ok(only.text.includes("No product lines"));
    assert.ok(only.text.includes(`Total per year: ${formatMoney(999)}`));
  });
});
