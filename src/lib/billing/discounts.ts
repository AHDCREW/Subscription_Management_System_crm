import { round2 } from "../money";
import { compareDates } from "./period";

export type DiscountType = "FIXED" | "PERCENTAGE";
export type DiscountScope = "SUBSCRIPTION" | "PRODUCTS";

/** A discount rule with plain numbers (convert Decimals with toNumber first). */
export interface DiscountRule {
  id: number;
  type: DiscountType;
  value: number;
  scope: DiscountScope;
  /** Products the discount applies to when scope is PRODUCTS. */
  productIds: number[];
  minPurchase?: number | null;
  minQuantity?: number | null;
  startDate?: Date | null;
  endDate?: Date | null;
  usageLimit?: number | null;
  usedCount: number;
  active: boolean;
}

/** The part of an invoice line a discount looks at. productId null = plan base fee. */
export interface DiscountableLine {
  productId: number | null;
  quantity: number;
  amount: number;
}

export interface DiscountContext {
  lines: DiscountableLine[];
  /** The invoice date the discount must be valid on. */
  on: Date;
}

export interface DiscountResult {
  discount: DiscountRule;
  /** Total discount, rounded to 2 decimals. */
  amount: number;
  /** Discount per line, same order as ctx.lines; sums exactly to `amount`. */
  allocations: number[];
}

const toCents = (value: number) => Math.round(round2(value) * 100);
const fromCents = (cents: number) => round2(cents / 100);

/** Whether a line counts toward (and can receive) this discount. */
export function isLineEligible(discount: DiscountRule, line: DiscountableLine): boolean {
  if (discount.scope === "SUBSCRIPTION") return true;
  return line.productId !== null && discount.productIds.includes(line.productId);
}

function eligibleTotals(discount: DiscountRule, lines: DiscountableLine[]) {
  let subtotal = 0;
  let quantity = 0;
  let count = 0;
  for (const line of lines) {
    if (!isLineEligible(discount, line)) continue;
    subtotal += toCents(line.amount);
    quantity += line.quantity;
    count += 1;
  }
  return { subtotal: fromCents(subtotal), quantity, count };
}

/**
 * Whether the discount can be used on an invoice with these lines on this date:
 * active, inside its date window (inclusive), under its usage limit, and the
 * eligible lines meet the minimum purchase and minimum quantity.
 */
export function isDiscountApplicable(discount: DiscountRule, ctx: DiscountContext): boolean {
  if (!discount.active) return false;
  if (discount.startDate && compareDates(ctx.on, discount.startDate) < 0) return false;
  if (discount.endDate && compareDates(ctx.on, discount.endDate) > 0) return false;
  if (discount.usageLimit !== null && discount.usageLimit !== undefined && discount.usedCount >= discount.usageLimit) {
    return false;
  }

  const eligible = eligibleTotals(discount, ctx.lines);
  if (eligible.count === 0 || eligible.subtotal <= 0) return false;
  if (discount.minPurchase !== null && discount.minPurchase !== undefined && eligible.subtotal < discount.minPurchase) {
    return false;
  }
  if (discount.minQuantity !== null && discount.minQuantity !== undefined && eligible.quantity < discount.minQuantity) {
    return false;
  }
  return true;
}

/**
 * Discount amount on the eligible subtotal: PERCENTAGE = value% of it,
 * FIXED = value. Never more than the eligible subtotal, never negative.
 */
export function discountAmount(discount: DiscountRule, lines: DiscountableLine[]): number {
  const { subtotal } = eligibleTotals(discount, lines);
  const raw = discount.type === "PERCENTAGE" ? (subtotal * discount.value) / 100 : discount.value;
  return round2(Math.max(0, Math.min(raw, subtotal)));
}

/**
 * Split `amount` across the eligible lines in proportion to their amounts.
 * Each share is rounded to 2 decimals and the rounding remainder goes onto
 * the largest eligible line, so the shares always add up to `amount`.
 */
export function allocateDiscount(discount: DiscountRule, lines: DiscountableLine[], amount: number): number[] {
  const allocations = lines.map(() => 0);
  const eligible = lines
    .map((line, index) => ({ index, cents: toCents(line.amount) }))
    .filter(({ index, cents }) => cents > 0 && isLineEligible(discount, lines[index]));
  const base = eligible.reduce((sum, line) => sum + line.cents, 0);
  const target = Math.min(toCents(amount), base);
  if (target <= 0 || base <= 0) return allocations;

  let allocated = 0;
  let largest = eligible[0];
  for (const line of eligible) {
    const share = Math.round((target * line.cents) / base);
    allocations[line.index] = share;
    allocated += share;
    if (line.cents > largest.cents) largest = line;
  }
  allocations[largest.index] += target - allocated;

  // A share can't exceed its line (only possible with tiny lines and a full discount).
  let overflow = 0;
  for (const line of eligible) {
    if (allocations[line.index] > line.cents) {
      overflow += allocations[line.index] - line.cents;
      allocations[line.index] = line.cents;
    }
  }
  for (const line of eligible) {
    if (overflow <= 0) break;
    const room = line.cents - allocations[line.index];
    const take = Math.min(room, overflow);
    allocations[line.index] += take;
    overflow -= take;
  }

  return allocations.map(fromCents);
}

function evaluate(discount: DiscountRule, lines: DiscountableLine[]): DiscountResult {
  const amount = discountAmount(discount, lines);
  return { discount, amount, allocations: allocateDiscount(discount, lines, amount) };
}

/**
 * Choose the one discount for this invoice (discounts never stack). A pinned
 * discount (the one attached to the subscription) wins if it applies;
 * otherwise the applicable discount with the largest amount is used (first one
 * wins a tie). Returns null when nothing applies or nothing would be saved.
 */
export function pickBestDiscount(
  discounts: DiscountRule[],
  ctx: DiscountContext,
  pinnedId?: number | null,
): DiscountResult | null {
  if (pinnedId !== null && pinnedId !== undefined) {
    const pinned = discounts.find((discount) => discount.id === pinnedId);
    if (pinned && isDiscountApplicable(pinned, ctx)) {
      const result = evaluate(pinned, ctx.lines);
      if (result.amount > 0) return result;
    }
  }

  let best: DiscountResult | null = null;
  for (const discount of discounts) {
    if (!isDiscountApplicable(discount, ctx)) continue;
    const result = evaluate(discount, ctx.lines);
    if (result.amount > 0 && (!best || result.amount > best.amount)) best = result;
  }
  return best;
}
