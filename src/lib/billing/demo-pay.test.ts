import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEMO_REFERENCE,
  demoPaymentNote,
  expiryInFuture,
  formatCardNumber,
  luhnValid,
  newDemoReference,
  parseExpiry,
  simulateDemoGateway,
  validateDemoPay,
  type DemoPayInput,
} from "./demo-pay";

const now = new Date(2026, 9, 31); // 31 Oct 2026

const card = (overrides: Partial<DemoPayInput> = {}): DemoPayInput => ({
  method: "CARD",
  cardNumber: "4242 4242 4242 4242",
  expiry: "12 / 30",
  cvc: "123",
  name: "Asha Rao",
  upiId: "",
  ...overrides,
});
const upi = (upiId: string): DemoPayInput => ({ method: "UPI", cardNumber: "", expiry: "", cvc: "", name: "", upiId });

describe("luhnValid", () => {
  it("accepts real test card numbers, with or without spaces", () => {
    assert.equal(luhnValid("4242424242424242"), true);
    assert.equal(luhnValid("4242 4242 4242 4242"), true);
    assert.equal(luhnValid("4000 0000 0000 0002"), true);
    assert.equal(luhnValid("5555 5555 5555 4444"), true);
  });

  it("rejects bad checksums, letters and wrong lengths", () => {
    assert.equal(luhnValid("4242 4242 4242 4241"), false);
    assert.equal(luhnValid("4242 4242 4242 424a"), false);
    assert.equal(luhnValid("4242"), false);
    assert.equal(luhnValid(""), false);
  });
});

describe("expiry", () => {
  it("parses MM/YY and MM/YYYY", () => {
    assert.deepEqual(parseExpiry("12 / 30"), { month: 12, year: 2030 });
    assert.deepEqual(parseExpiry("03/2027"), { month: 3, year: 2027 });
    assert.equal(parseExpiry("13/30"), null);
    assert.equal(parseExpiry("1230"), null);
  });

  it("is good through the end of the expiry month", () => {
    assert.equal(expiryInFuture("10/26", now), true);
    assert.equal(expiryInFuture("11/26", now), true);
    assert.equal(expiryInFuture("09/26", now), false);
    assert.equal(expiryInFuture("12/25", now), false);
  });
});

describe("validateDemoPay", () => {
  it("passes the prefilled test card", () => {
    assert.deepEqual(validateDemoPay(card(), now), {});
  });

  it("flags each bad card field", () => {
    const errors = validateDemoPay(card({ cardNumber: "4242 4242 4242 4241", expiry: "01/26", cvc: "12", name: " " }), now);
    assert.ok(errors.cardNumber && errors.expiry && errors.cvc && errors.name);
  });

  it("only takes the demo UPI ids", () => {
    assert.deepEqual(validateDemoPay(upi("success@subflow"), now), {});
    assert.deepEqual(validateDemoPay(upi("failure@subflow"), now), {});
    assert.match(validateDemoPay(upi("someone@okbank"), now).upiId ?? "", /demo mode/);
    assert.match(validateDemoPay(upi("not-an-id"), now).upiId ?? "", /name@bank/);
  });

  it("needs a known method", () => {
    assert.ok(validateDemoPay(card({ method: "CASH" }), now).method);
  });
});

describe("simulateDemoGateway", () => {
  it("approves a valid card and labels it by its last four digits", () => {
    assert.deepEqual(simulateDemoGateway(card(), now), { status: "approved", method: "CARD", label: "card •••• 4242" });
  });

  it("declines a card ending 0002", () => {
    const result = simulateDemoGateway(card({ cardNumber: "4000 0000 0000 0002" }), now);
    assert.equal(result.status, "declined");
  });

  it("approves success@subflow and fails failure@subflow (any case)", () => {
    assert.deepEqual(simulateDemoGateway(upi("Success@SubFlow"), now), {
      status: "approved",
      method: "UPI",
      label: "UPI success@subflow",
    });
    assert.equal(simulateDemoGateway(upi("failure@subflow"), now).status, "declined");
  });

  it("never approves invalid input", () => {
    assert.equal(simulateDemoGateway(card({ cardNumber: "1234 5678 9012 3456" }), now).status, "invalid");
    assert.equal(simulateDemoGateway(card({ expiry: "09/26" }), now).status, "invalid");
    assert.equal(simulateDemoGateway(upi("someone@okbank"), now).status, "invalid");
  });
});

describe("helpers", () => {
  it("formats card numbers in groups of four", () => {
    assert.equal(formatCardNumber("4242424242424242"), "4242 4242 4242 4242");
    assert.equal(formatCardNumber("42 42-4"), "4242 4");
  });

  it("builds the payment note", () => {
    assert.equal(demoPaymentNote("card •••• 4242"), "Paid online (Demo Pay, card •••• 4242)");
  });

  it("makes a fresh DEMO- reference each time", () => {
    const a = newDemoReference();
    const b = newDemoReference();
    assert.match(a, DEMO_REFERENCE);
    assert.notEqual(a, b);
  });
});
