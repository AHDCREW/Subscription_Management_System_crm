"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { round2, toNumber } from "@/lib/money";
import {
  EDITABLE_STATUSES,
  addDays,
  formatDay,
  isPlanAvailableOn,
  parseDateInput,
  subscriptionNumber,
  todayUtc,
} from "@/lib/subscriptions/subscriptions";
import { CUSTOMER_SEARCH_LIMIT, customerSelect, type CustomerOption } from "./data";

type FieldName =
  | "customerId"
  | "planId"
  | "templateId"
  | "startDate"
  | "expiryDate"
  | "paymentTermDays"
  | "notes"
  | "lines";

export type SaveSubscriptionResult =
  | { ok: true; id: number; number: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<FieldName, string>>;
      // Keyed by the client-side row key so errors stay on the right row.
      lineErrors?: Record<string, string>;
    };

const MAX_LINES = 50;
const MAX_PRICE = 9_999_999_999.99; // Decimal(12, 2)

const optionalId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable(),
);

const lineSchema = z.object({
  key: z.coerce.string(),
  productId: z.coerce.number({ error: "Choose a product." }).int().positive("Choose a product."),
  variantId: optionalId,
  quantity: z.coerce
    .number({ error: "Quantity must be a whole number." })
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(100000, "Quantity is too large."),
  unitPrice: z.coerce
    .number({ error: "Enter a unit price." })
    .min(0, "Unit price can't be negative.")
    .max(MAX_PRICE, "Unit price is too large.")
    .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, "Use at most 2 decimal places."),
  taxId: optionalId,
});

const dateInput = (message: string) =>
  z
    .string()
    .trim()
    .refine((value) => parseDateInput(value) !== null, message)
    .transform((value) => parseDateInput(value) as Date);

const subscriptionSchema = z.object({
  customerId: z.coerce.number({ error: "Choose a customer." }).int().positive("Choose a customer."),
  planId: z.coerce.number({ error: "Choose a plan." }).int().positive("Choose a plan."),
  templateId: optionalId,
  startDate: dateInput("Enter a valid start date."),
  expiryDate: z
    .string()
    .trim()
    .refine((value) => value === "" || parseDateInput(value) !== null, "Enter a valid expiry date.")
    .transform((value) => (value ? parseDateInput(value) : null)),
  paymentTermDays: z.coerce
    .number({ error: "Payment terms must be a whole number of days." })
    .int("Payment terms must be a whole number of days.")
    .min(0, "Payment terms can't be negative.")
    .max(365, "Payment terms can be at most 365 days."),
  notes: z
    .string()
    .trim()
    .max(5000, "Keep the notes under 5000 characters.")
    .transform((value) => value || null),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one product line.")
    .max(MAX_LINES, `A subscription can have at most ${MAX_LINES} lines.`),
});

function parseId(value: FormDataEntryValue | null): number | null {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseLines(value: FormDataEntryValue | null): unknown {
  try {
    return JSON.parse(String(value ?? "[]"));
  } catch {
    return null;
  }
}

const invalid = (
  fieldErrors: Partial<Record<FieldName, string>>,
  lineErrors: Record<string, string> = {},
): SaveSubscriptionResult => ({ ok: false, error: "Please fix the highlighted fields.", fieldErrors, lineErrors });

// Creates a new Draft subscription, or updates one that is still Draft or Quotation.
export async function saveSubscription(formData: FormData): Promise<SaveSubscriptionResult> {
  const user = await requireTeam();

  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { ok: false, error: "This subscription could not be found." };

  const rawLines = parseLines(formData.get("lines"));
  const parsed = subscriptionSchema.safeParse({
    customerId: formData.get("customerId") ?? "",
    planId: formData.get("planId") ?? "",
    templateId: formData.get("templateId") ?? "",
    startDate: String(formData.get("startDate") ?? ""),
    expiryDate: String(formData.get("expiryDate") ?? ""),
    paymentTermDays: formData.get("paymentTermDays") ?? "",
    notes: String(formData.get("notes") ?? ""),
    lines: Array.isArray(rawLines) ? rawLines : [],
  });

  if (!parsed.success) {
    const fieldErrors: Partial<Record<FieldName, string>> = {};
    const lineErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field, index] = issue.path;
      if (field === "lines" && typeof index === "number") {
        const row = Array.isArray(rawLines) ? (rawLines[index] as { key?: unknown } | undefined) : undefined;
        lineErrors[String(row?.key ?? index)] ??= issue.message;
      } else if (typeof field === "string") {
        fieldErrors[field as FieldName] ??= issue.message;
      }
    }
    return invalid(fieldErrors, lineErrors);
  }

  const { customerId, planId, startDate, expiryDate, paymentTermDays, notes, lines } = parsed.data;
  // The template is chosen once, when the subscription is created.
  const templateId = id ? null : parsed.data.templateId;

  const existing = id
    ? await db.subscription.findUnique({
        where: { id },
        select: { status: true, number: true, lines: { select: { taxId: true } } },
      })
    : null;
  if (id && !existing) return { ok: false, error: "This subscription no longer exists." };
  if (existing && !EDITABLE_STATUSES.includes(existing.status)) {
    return { ok: false, error: `${existing.number} is no longer a draft or quotation, so it can't be edited.` };
  }
  const keepTaxIds = new Set(existing?.lines.flatMap((line) => (line.taxId ? [line.taxId] : [])) ?? []);

  const [customer, plan, template, products, taxes] = await Promise.all([
    db.user.findUnique({ where: { id: customerId }, select: { role: true } }),
    db.plan.findUnique({
      where: { id: planId },
      select: { name: true, active: true, minQuantity: true, startDate: true, endDate: true },
    }),
    templateId ? db.quotationTemplate.findUnique({ where: { id: templateId }, select: { validityDays: true } }) : null,
    db.product.findMany({
      where: { id: { in: [...new Set(lines.map((line) => line.productId))] } },
      select: {
        id: true,
        name: true,
        active: true,
        variants: { select: { id: true, attribute: true, value: true } },
      },
    }),
    db.tax.findMany({
      where: { id: { in: [...new Set(lines.flatMap((line) => (line.taxId ? [line.taxId] : [])))] } },
      select: { id: true, name: true, active: true },
    }),
  ]);

  const fieldErrors: Partial<Record<FieldName, string>> = {};
  const lineErrors: Record<string, string> = {};

  if (!customer) fieldErrors.customerId = "That customer no longer exists.";
  else if (customer.role !== "CUSTOMER") fieldErrors.customerId = "Subscriptions can only be created for customer accounts.";

  if (!plan) fieldErrors.planId = "That plan no longer exists. Choose another.";
  else if (!plan.active) fieldErrors.planId = `${plan.name} is inactive. Choose an active plan.`;
  else if (!isPlanAvailableOn(plan, startDate)) {
    const saleWindow = [
      plan.startDate && `from ${formatDay(plan.startDate)}`,
      plan.endDate && `until ${formatDay(plan.endDate)}`,
    ].filter(Boolean);
    fieldErrors.planId = `${plan.name} isn't available on ${formatDay(startDate)}${
      saleWindow.length ? ` (on sale ${saleWindow.join(" ")})` : ""
    }.`;
  }

  if (templateId && !template) fieldErrors.templateId = "That template no longer exists.";

  if (expiryDate && expiryDate.getTime() <= startDate.getTime()) {
    fieldErrors.expiryDate = "The expiry date must be after the start date.";
  }

  const productsById = new Map(products.map((product) => [product.id, product]));
  const taxesById = new Map(taxes.map((tax) => [tax.id, tax]));
  const descriptions = new Map<string, string>();
  for (const line of lines) {
    const product = productsById.get(line.productId);
    const variant = product?.variants.find((v) => v.id === line.variantId);
    const tax = line.taxId ? taxesById.get(line.taxId) : null;
    if (!product) {
      lineErrors[line.key] = "This product no longer exists.";
    } else if (!product.active) {
      lineErrors[line.key] = `${product.name} is inactive. Choose an active product.`;
    } else if (line.variantId !== null && !variant) {
      lineErrors[line.key] = `That variant does not belong to ${product.name}.`;
    } else if (plan && line.quantity < plan.minQuantity) {
      lineErrors[line.key] = `${plan.name} needs a quantity of at least ${plan.minQuantity} per line.`;
    } else if (line.taxId && !tax) {
      lineErrors[line.key] = "That tax no longer exists.";
    } else if (tax && !tax.active && !keepTaxIds.has(tax.id)) {
      lineErrors[line.key] = `${tax.name} is inactive. Choose another tax.`;
    } else {
      descriptions.set(line.key, variant ? `${product.name} (${variant.attribute}: ${variant.value})` : product.name);
    }
  }

  if (Object.keys(fieldErrors).length || Object.keys(lineErrors).length) return invalid(fieldErrors, lineErrors);

  const data = {
    customerId,
    planId,
    startDate,
    expiryDate,
    // Billing is in advance, so the first invoice falls on the start date. The
    // billing run only invoices Active subscriptions.
    nextInvoiceDate: startDate,
    paymentTermDays,
    notes,
  };
  const lineData = lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    description: descriptions.get(line.key)?.slice(0, 255) ?? null,
    quantity: line.quantity,
    unitPrice: new Prisma.Decimal(round2(toNumber(line.unitPrice)).toFixed(2)),
    taxId: line.taxId,
  }));

  try {
    const saved = await db.$transaction(async (tx) => {
      if (id) {
        // Status guard in the same statement: a confirm that slipped in since
        // the check above makes this update a no-op instead of editing it.
        const { count } = await tx.subscription.updateMany({
          where: { id, status: { in: EDITABLE_STATUSES } },
          data,
        });
        if (count === 0) return null;
        await tx.subscriptionLine.deleteMany({ where: { subscriptionId: id } });
        await tx.subscriptionLine.createMany({ data: lineData.map((line) => ({ ...line, subscriptionId: id })) });
        return { id, number: existing!.number };
      }

      // Insert with a throwaway unique number, then derive SUB-00001 from the
      // auto-increment id. Both happen in one transaction, so the placeholder
      // is never visible and two concurrent saves can't get the same number.
      const created = await tx.subscription.create({
        data: {
          ...data,
          number: `TMP-${randomBytes(8).toString("hex")}`,
          status: "DRAFT",
          salespersonId: user.id,
          templateId,
          quotationExpiresAt: template ? addDays(todayUtc(), template.validityDays) : null,
          lines: { create: lineData },
        },
        select: { id: true },
      });
      const number = subscriptionNumber(created.id);
      await tx.subscription.update({ where: { id: created.id }, data: { number } });
      return { id: created.id, number };
    });

    if (!saved) return { ok: false, error: "This subscription was confirmed by someone else, so it can't be edited." };

    revalidatePath("/dashboard/subscriptions");
    revalidatePath(`/dashboard/subscriptions/${saved.id}`);
    return { ok: true, ...saved };
  } catch (err) {
    // Something was deleted between validation and saving.
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2025" || err.code === "P2003")) {
      return {
        ok: false,
        error: "The customer, plan, a product or a tax was changed by someone else. Reload the page and try again.",
      };
    }
    // Only possible if a number was set by hand (e.g. imported data) and clashes.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Could not assign a unique subscription number. Please try again." };
    }
    throw err;
  }
}

// Customer picker search: existing CUSTOMER accounts by name, email or company.
export async function searchCustomers(query: string): Promise<CustomerOption[]> {
  await requireTeam();

  const q = String(query ?? "").trim().slice(0, 120);
  return db.user.findMany({
    where: {
      role: "CUSTOMER",
      ...(q && { OR: [{ name: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] }),
    },
    orderBy: { name: "asc" },
    take: CUSTOMER_SEARCH_LIMIT,
    select: customerSelect,
  });
}
