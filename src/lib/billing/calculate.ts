import { round2 } from "../money";
import { pickBestDiscount, type DiscountRule } from "./discounts";

/** A subscription line with plain numbers (convert Decimals with toNumber first). */
export interface BillingLineInput {
  productId: number;
  description: string;
  quantity: number;
  /** Tax-exclusive price per unit (product sales price + variant extra price). */
  unitPrice: number;
  /** Tax percent for this line, e.g. 18 for 18% GST. Null/undefined = no tax. */
  taxRate?: number | null;
}

export interface CalculateInvoiceInput {
  lines: BillingLineInput[];
  /** Plan price per period; billed as its own base-fee line when > 0. */
  planPrice: number;
  planName: string;
  /** Tax percent on the base-fee line (plans have no tax rule by default). */
  planTaxRate?: number | null;
  /** Discounts that may apply; only one is ever used. */
  discounts: DiscountRule[];
  /** The discount attached to the subscription, preferred if it applies. */
  pinnedDiscountId?: number | null;
  /** Invoice date (the period start, since billing is in advance). */
  on: Date;
}

export interface CalculatedLine {
  /** Null for the plan base-fee line. */
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  /** quantity × unitPrice, before discount and tax. */
  amount: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  /** amount − discountAmount + taxAmount. */
  total: number;
}

export interface CalculatedInvoice {
  lines: CalculatedLine[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  total: number;
  appliedDiscountId: number | null;
}

/** Unit price of a line: product sales price plus the variant's extra price. */
export function linePrice(salesPrice: number, variantExtraPrice = 0): number {
  return round2(salesPrice + variantExtraPrice);
}

/** Tax on a line after its discount: round2((amount − discount) × rate / 100). */
export function lineTax(amount: number, discount: number, rate: number): number {
  return round2(((amount - discount) * rate) / 100);
}

/** Add money values without float drift (all inputs already have 2 decimals). */
function sumMoney(values: number[]): number {
  return round2(values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100);
}

/**
 * Build an invoice for one billing period: the plan base fee plus every
 * subscription line, the single best discount, per-line tax and totals.
 * All money is rounded to 2 decimals and every total equals the sum of its
 * line values exactly.
 */
export function calculateInvoice(input: CalculateInvoiceInput): CalculatedInvoice {
  const priced: Omit<CalculatedLine, "discountAmount" | "taxAmount" | "total">[] = [];

  const planPrice = round2(input.planPrice);
  if (planPrice > 0) {
    priced.push({
      productId: null,
      description: input.planName,
      quantity: 1,
      unitPrice: planPrice,
      amount: planPrice,
      taxRate: input.planTaxRate ?? 0,
    });
  }

  for (const line of input.lines) {
    const unitPrice = round2(line.unitPrice);
    priced.push({
      productId: line.productId,
      description: line.description,
      quantity: line.quantity,
      unitPrice,
      amount: round2(line.quantity * unitPrice),
      taxRate: line.taxRate ?? 0,
    });
  }

  const best = pickBestDiscount(input.discounts, { lines: priced, on: input.on }, input.pinnedDiscountId);

  const lines: CalculatedLine[] = priced.map((line, index) => {
    const discountAmount = best ? best.allocations[index] : 0;
    const taxAmount = lineTax(line.amount, discountAmount, line.taxRate);
    return {
      ...line,
      discountAmount,
      taxAmount,
      total: round2(line.amount - discountAmount + taxAmount),
    };
  });

  const subtotal = sumMoney(lines.map((line) => line.amount));
  const discountTotal = sumMoney(lines.map((line) => line.discountAmount));
  const taxTotal = sumMoney(lines.map((line) => line.taxAmount));

  return {
    lines,
    subtotal,
    discountTotal,
    taxTotal,
    total: sumMoney([subtotal, -discountTotal, taxTotal]),
    appliedDiscountId: best ? best.discount.id : null,
  };
}
