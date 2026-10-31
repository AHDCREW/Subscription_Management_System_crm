import { z } from "zod";

// Server-side validation for the product form.

// Largest value that fits in DECIMAL(12,2).
const MAX_MONEY = 9_999_999_999.99;

// Parses a money input ("1,499.50") into a 2-decimal string Prisma can store as Decimal.
export function money(label: string, required: boolean) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      const value = raw.replace(/,/g, "");
      if (value === "") {
        if (!required) return "0.00";
        ctx.addIssue({ code: "custom", message: `${label} is required.` });
        return z.NEVER;
      }
      if (value.startsWith("-")) {
        ctx.addIssue({ code: "custom", message: `${label} can't be negative.` });
        return z.NEVER;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        ctx.addIssue({ code: "custom", message: `Enter ${label.toLowerCase()} as a number, e.g. 999 or 999.50.` });
        return z.NEVER;
      }
      const amount = Number(value);
      if (amount > MAX_MONEY) {
        ctx.addIssue({ code: "custom", message: `${label} is too large.` });
        return z.NEVER;
      }
      return amount.toFixed(2);
    });
}

export const productSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Product name is required.")
    .max(160, "Product name must be 160 characters or fewer."),
  type: z.enum(["SOFTWARE", "ADDON", "SERVICE"], { error: "Choose a product type." }),
  salesPrice: money("Sales price", true),
  costPrice: money("Cost price", false),
  notes: z
    .string()
    .trim()
    .max(5000, "Notes must be 5,000 characters or fewer.")
    .transform((v) => v || null),
  taxId: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d+$/.test(v), "Choose a tax from the list.")
    .transform((v) => (v === "" ? null : Number(v))),
  active: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;
export type ProductField = keyof ProductInput;

// Raw form values, echoed back so the form keeps what the user typed after an error.
export type ProductFormValues = Record<Exclude<ProductField, "active">, string> & { active: boolean };

export function readProductForm(formData: FormData): ProductFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    type: text("type"),
    salesPrice: text("salesPrice"),
    costPrice: text("costPrice"),
    notes: text("notes"),
    taxId: text("taxId"),
    active: formData.get("active") === "on",
  };
}
