import { z } from "zod";
import type { BadgeTone } from "@/components/kit";
import { formatDay, parseDateInput, todayUtc } from "@/lib/subscriptions/subscriptions";

// Server-side validation and display helpers for discount rules.

// Largest value that fits in DECIMAL(12,2).
const MAX_MONEY = 9_999_999_999.99;
const MAX_COUNT = 1_000_000_000;

function decimal(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      const value = raw.replace(/,/g, "").replace(/\s*%$/, "");
      if (value === "") {
        if (!required) return null;
        ctx.addIssue({ code: "custom", message: `${label} is required.` });
        return z.NEVER;
      }
      if (value.startsWith("-")) {
        ctx.addIssue({ code: "custom", message: `${label} can't be negative.` });
        return z.NEVER;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        ctx.addIssue({ code: "custom", message: `Enter ${label.toLowerCase()} as a number with up to 2 decimals.` });
        return z.NEVER;
      }
      const amount = Number(value);
      if (amount <= 0) {
        ctx.addIssue({
          code: "custom",
          message: required ? `${label} must be more than 0.` : `${label} must be more than 0, or leave it empty.`,
        });
        return z.NEVER;
      }
      if (amount > MAX_MONEY) {
        ctx.addIssue({ code: "custom", message: `${label} is too large.` });
        return z.NEVER;
      }
      return amount.toFixed(2);
    });
}

function optionalCount(label: string) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (raw === "") return null;
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > MAX_COUNT) {
        ctx.addIssue({ code: "custom", message: `${label} must be a whole number, 1 or more.` });
        return z.NEVER;
      }
      return Number(raw);
    });
}

function optionalDate(label: string) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (raw === "") return null;
      const date = parseDateInput(raw);
      if (!date) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${label}.` });
        return z.NEVER;
      }
      return date;
    });
}

export const discountSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Discount name is required.").max(120, "Discount name must be 120 characters or fewer.")),
  type: z.enum(["FIXED", "PERCENTAGE"], { error: "Choose a discount type." }),
  value: decimal("Value", true).pipe(z.string()),
  scope: z.enum(["SUBSCRIPTION", "PRODUCTS"], { error: "Choose what the discount applies to." }),
  productIds: z
    .array(z.string().regex(/^\d+$/, "Choose products from the list."))
    .transform((ids) => [...new Set(ids.map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0)),
  minPurchase: decimal("Minimum purchase", false),
  minQuantity: optionalCount("Minimum quantity"),
  startDate: optionalDate("start date"),
  endDate: optionalDate("end date"),
  usageLimit: optionalCount("Usage limit"),
  active: z.boolean(),
});

export type DiscountInput = z.infer<typeof discountSchema>;
export type DiscountField = keyof DiscountInput;

// Raw form values, echoed back so the form keeps what the user typed after an error.
export type DiscountFormValues = {
  name: string;
  type: string;
  value: string;
  scope: string;
  productIds: string[];
  minPurchase: string;
  minQuantity: string;
  startDate: string;
  endDate: string;
  usageLimit: string;
  active: boolean;
};

export function readDiscountForm(formData: FormData): DiscountFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    type: text("type"),
    value: text("value"),
    scope: text("scope"),
    productIds: formData.getAll("productIds").filter((v): v is string => typeof v === "string"),
    minPurchase: text("minPurchase"),
    minQuantity: text("minQuantity"),
    startDate: text("startDate"),
    endDate: text("endDate"),
    usageLimit: text("usageLimit"),
    active: formData.get("active") === "on",
  };
}

// Field checks plus the cross-field rules (percent cap, product list, date order),
// reported together so the user sees every problem at once.
export function validateDiscount(values: DiscountFormValues) {
  const fieldErrors: Partial<Record<DiscountField, string>> = {};
  const parsed = discountSchema.safeParse(values);
  if (!parsed.success) {
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as DiscountField] = messages[0];
    }
  }

  const value = Number(values.value.trim().replace(/,/g, "").replace(/\s*%$/, ""));
  if (!fieldErrors.value && values.type === "PERCENTAGE" && value > 100) {
    fieldErrors.value = "A percentage can't be more than 100%.";
  }
  if (!fieldErrors.productIds && values.scope === "PRODUCTS" && values.productIds.length === 0) {
    fieldErrors.productIds = "Choose at least one product.";
  }
  const start = parseDateInput(values.startDate.trim());
  const end = parseDateInput(values.endDate.trim());
  if (!fieldErrors.endDate && start && end && end < start) {
    fieldErrors.endDate = "End date can't be before the start date.";
  }

  if (!parsed.success || Object.keys(fieldErrors).length > 0) return { fieldErrors } as const;
  const data = parsed.data;
  return { data: { ...data, productIds: data.scope === "PRODUCTS" ? data.productIds : [] } } as const;
}

// ─── Display helpers ───

type DiscountLike = {
  type: "FIXED" | "PERCENTAGE";
  value: number;
  active: boolean;
  startDate: Date | null;
  endDate: Date | null;
  usageLimit: number | null;
  usedCount: number;
};

export function formatRupees(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDiscountValue(d: Pick<DiscountLike, "type" | "value">): string {
  return d.type === "PERCENTAGE" ? `${d.value}%` : formatRupees(d.value);
}

export function validityLabel(startDate: Date | null, endDate: Date | null): string {
  if (startDate && endDate) return `${formatDay(startDate)} – ${formatDay(endDate)}`;
  if (startDate) return `From ${formatDay(startDate)}`;
  if (endDate) return `Until ${formatDay(endDate)}`;
  return "No end date";
}

export type DiscountStatus = { label: string; tone: BadgeTone };

// Dates are inclusive, matching the billing engine: a discount ending today still applies today.
export function discountStatus(d: DiscountLike, today = todayUtc()): DiscountStatus {
  if (!d.active) return { label: "Inactive", tone: "gray" };
  if (d.endDate && d.endDate < today) return { label: "Expired", tone: "gray" };
  if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return { label: "Used up", tone: "gray" };
  if (d.startDate && d.startDate > today) return { label: "Scheduled", tone: "blue" };
  return { label: "Active", tone: "green" };
}
