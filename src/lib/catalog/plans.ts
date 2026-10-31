import { z } from "zod";
import { money } from "@/lib/catalog/products";
import { parseDateInput } from "@/lib/subscriptions/subscriptions";

// Server-side validation for the plan form.

const MAX_MIN_QUANTITY = 100_000;
const DATE_ORDER_MESSAGE = "End date can't be before the start date.";

function optionalDate(label: string) {
  return z
    .string()
    .trim()
    .transform((raw, ctx) => {
      if (raw === "") return null;
      const date = parseDateInput(raw);
      if (!date) {
        ctx.addIssue({ code: "custom", message: `Enter a valid ${label.toLowerCase()}.` });
        return z.NEVER;
      }
      return date;
    });
}

export const planSchema = z
  .object({
    name: z.string().trim().min(1, "Plan name is required.").max(120, "Plan name must be 120 characters or fewer."),
    price: money("Price", true),
    billingPeriod: z.enum(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"], { error: "Choose a billing period." }),
    minQuantity: z
      .string()
      .trim()
      .transform((raw, ctx) => {
        if (!/^\d+$/.test(raw)) {
          ctx.addIssue({ code: "custom", message: "Minimum quantity must be a whole number, 1 or more." });
          return z.NEVER;
        }
        const value = Number(raw);
        if (value < 1 || value > MAX_MIN_QUANTITY) {
          ctx.addIssue({ code: "custom", message: `Minimum quantity must be between 1 and ${MAX_MIN_QUANTITY.toLocaleString("en-IN")}.` });
          return z.NEVER;
        }
        return value;
      }),
    startDate: optionalDate("Start date"),
    endDate: optionalDate("End date"),
    autoClose: z.boolean(),
    closable: z.boolean(),
    pausable: z.boolean(),
    renewable: z.boolean(),
    active: z.boolean(),
  })
  .superRefine((plan, ctx) => {
    if (plan.startDate && plan.endDate && plan.endDate < plan.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: DATE_ORDER_MESSAGE });
    }
  });

// zod skips the object-level date check while other fields are invalid; this lets
// the form report it alongside those errors.
export function dateOrderError(values: { startDate: string; endDate: string }): string | undefined {
  const start = parseDateInput(values.startDate.trim());
  const end = parseDateInput(values.endDate.trim());
  return start && end && end < start ? DATE_ORDER_MESSAGE : undefined;
}

export type PlanInput = z.infer<typeof planSchema>;
export type PlanField = keyof PlanInput;

type BooleanField = "autoClose" | "closable" | "pausable" | "renewable" | "active";

// Raw form values, echoed back so the form keeps what the user typed after an error.
export type PlanFormValues = Record<Exclude<PlanField, BooleanField>, string> & Record<BooleanField, boolean>;

export function readPlanForm(formData: FormData): PlanFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const checked = (key: string) => formData.get(key) === "on";
  return {
    name: text("name"),
    price: text("price"),
    billingPeriod: text("billingPeriod"),
    minQuantity: text("minQuantity"),
    startDate: text("startDate"),
    endDate: text("endDate"),
    autoClose: checked("autoClose"),
    closable: checked("closable"),
    pausable: checked("pausable"),
    renewable: checked("renewable"),
    active: checked("active"),
  };
}
