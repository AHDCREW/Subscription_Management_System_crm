import { z } from "zod";

// Server-side validation for tax rules. A tax is a name plus a percent rate, e.g. GST 18%.

export const taxSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(1, "Tax name is required.").max(80, "Tax name must be 80 characters or fewer.")),
  // Parses "18", "5.5" or "18%" into a 2-decimal string Prisma can store as DECIMAL(5,2).
  rate: z
    .string()
    .trim()
    .transform((raw, ctx) => {
      const value = raw.replace(/\s*%$/, "");
      if (value === "") {
        ctx.addIssue({ code: "custom", message: "Rate is required." });
        return z.NEVER;
      }
      if (value.startsWith("-")) {
        ctx.addIssue({ code: "custom", message: "Rate can't be negative." });
        return z.NEVER;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(value)) {
        ctx.addIssue({ code: "custom", message: "Enter the rate as a percent with up to 2 decimals, e.g. 18 or 5.5." });
        return z.NEVER;
      }
      const rate = Number(value);
      if (rate > 100) {
        ctx.addIssue({ code: "custom", message: "Rate can't be more than 100%." });
        return z.NEVER;
      }
      return rate.toFixed(2);
    }),
  active: z.boolean(),
});

export type TaxInput = z.infer<typeof taxSchema>;
export type TaxField = keyof TaxInput;

// Raw form values, echoed back so the dialog keeps what the user typed after an error.
export type TaxFormValues = { name: string; rate: string; active: boolean };

export function readTaxForm(formData: FormData): TaxFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { name: text("name"), rate: text("rate"), active: formData.get("active") === "on" };
}

export function validateTax(values: TaxFormValues) {
  const parsed = taxSchema.safeParse(values);
  if (parsed.success) return { data: parsed.data } as const;
  const fieldErrors: Partial<Record<TaxField, string>> = {};
  for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
    if (messages?.length) fieldErrors[field as TaxField] = messages[0];
  }
  return { fieldErrors } as const;
}

