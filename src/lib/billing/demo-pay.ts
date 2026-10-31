// Demo Pay: a built-in test-mode checkout, so the portal can take "online"
// payments without a third-party gateway. These rules are pure (no database,
// no framework) so the checkout form can pre-check input and the server action
// can decide the real result from the same test values.
//
//   Card 4242 4242 4242 4242 (any valid card) → approved
//   A card ending 0002                         → declined
//   UPI success@subflow                        → approved
//   UPI failure@subflow                        → declined

export const DEMO_CARD_SUCCESS = "4242 4242 4242 4242";
export const DEMO_CARD_DECLINE = "4000 0000 0000 0002";
export const DEMO_UPI_SUCCESS = "success@subflow";
export const DEMO_UPI_FAILURE = "failure@subflow";

export type DemoPayMethod = "CARD" | "UPI";

export type DemoPayInput = {
  method: string;
  cardNumber: string;
  expiry: string;
  cvc: string;
  name: string;
  upiId: string;
};

export type DemoPayFieldErrors = Partial<Record<keyof DemoPayInput, string>>;

export type DemoGatewayResult =
  | { status: "approved"; method: DemoPayMethod; label: string }
  | { status: "declined"; message: string }
  | { status: "invalid"; fieldErrors: DemoPayFieldErrors };

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/** Card number as typed groups of four: "4242424242424242" → "4242 4242 4242 4242". */
export function formatCardNumber(value: string): string {
  return digitsOnly(value).slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** The Luhn checksum every real card number passes. */
export function luhnValid(value: string): boolean {
  const digits = digitsOnly(value);
  if (digits.length < 12 || digits.length > 19 || digits !== value.replace(/[\s-]/g, "")) return false;
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** "MM/YY" or "MM/YYYY" (spaces allowed) as a month and full year, or null. */
export function parseExpiry(value: string): { month: number; year: number } | null {
  const match = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[1]);
  const year = match[2].length === 2 ? 2000 + Number(match[2]) : Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { month, year };
}

/** A card is good through the last day of its expiry month. */
export function expiryInFuture(value: string, now: Date = new Date()): boolean {
  const expiry = parseExpiry(value);
  if (!expiry) return false;
  const current = now.getFullYear() * 12 + now.getMonth();
  return expiry.year * 12 + (expiry.month - 1) >= current;
}

const UPI_ID = /^[a-z0-9._-]{2,64}@[a-z0-9]{2,32}$/i;

/** Field checks only (what the checkout form can show before submitting). */
export function validateDemoPay(input: DemoPayInput, now: Date = new Date()): DemoPayFieldErrors {
  const errors: DemoPayFieldErrors = {};

  if (input.method === "CARD") {
    const number = input.cardNumber.trim();
    if (!number) errors.cardNumber = "Enter your card number.";
    else if (!luhnValid(number)) errors.cardNumber = "That card number isn't valid.";

    if (!input.expiry.trim()) errors.expiry = "Enter the expiry date.";
    else if (!parseExpiry(input.expiry)) errors.expiry = "Use MM/YY.";
    else if (!expiryInFuture(input.expiry, now)) errors.expiry = "This card has expired.";

    if (!/^\d{3,4}$/.test(input.cvc.trim())) errors.cvc = "Enter the 3 or 4 digit CVC.";

    const name = input.name.trim();
    if (!name) errors.name = "Enter the name on the card.";
    else if (name.length > 80) errors.name = "Keep the name to 80 characters or fewer.";
  } else if (input.method === "UPI") {
    const upiId = input.upiId.trim();
    if (!upiId) errors.upiId = "Enter your UPI ID.";
    else if (!UPI_ID.test(upiId)) errors.upiId = "Enter a UPI ID like name@bank.";
    else if (![DEMO_UPI_SUCCESS, DEMO_UPI_FAILURE].includes(upiId.toLowerCase())) {
      errors.upiId = `In demo mode, use ${DEMO_UPI_SUCCESS} or ${DEMO_UPI_FAILURE}.`;
    }
  } else {
    errors.method = "Choose card or UPI.";
  }

  return errors;
}

/** What the test-mode gateway answers for this input. Decided only from the test values. */
export function simulateDemoGateway(input: DemoPayInput, now: Date = new Date()): DemoGatewayResult {
  const fieldErrors = validateDemoPay(input, now);
  if (Object.keys(fieldErrors).length > 0) return { status: "invalid", fieldErrors };

  if (input.method === "CARD") {
    const last4 = digitsOnly(input.cardNumber).slice(-4);
    if (last4 === "0002") return { status: "declined", message: "Your card was declined. Try another card or pay with UPI." };
    return { status: "approved", method: "CARD", label: `card •••• ${last4}` };
  }

  const upiId = input.upiId.trim().toLowerCase();
  if (upiId === DEMO_UPI_FAILURE) return { status: "declined", message: "The UPI payment failed. Try again or pay by card." };
  return { status: "approved", method: "UPI", label: `UPI ${upiId}` };
}

/** Payment note for an approved demo payment. */
export function demoPaymentNote(label: string): string {
  return `Paid online (Demo Pay, ${label})`;
}

const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 symbols, no 0/O or 1/I

/** A fresh gateway reference like DEMO-7KQ2M9XP4HRT (one per payment attempt). */
export function newDemoReference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `DEMO-${Array.from(bytes, (b) => REFERENCE_ALPHABET[b % 32]).join("")}`;
}

export const DEMO_REFERENCE = /^DEMO-[A-Z2-9]{12}$/;
