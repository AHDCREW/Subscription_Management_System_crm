"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";

type FieldName = "name" | "planId" | "validityDays" | "notes" | "lines";

export type TemplateFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<FieldName, string>>;
      // Keyed by the client-side row key so errors stay on the right row.
      lineErrors?: Record<string, string>;
    }
  | undefined;

export type DeleteTemplateState = { error?: string } | undefined;

const MAX_LINES = 50;

const lineSchema = z.object({
  key: z.coerce.string(),
  productId: z.coerce.number({ error: "Choose a product." }).int().positive("Choose a product."),
  variantId: z.coerce.number().int().positive().nullable(),
  quantity: z.coerce
    .number({ error: "Quantity must be a whole number." })
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(100000, "Quantity is too large."),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(120, "Keep the name under 120 characters."),
  planId: z.coerce.number({ error: "Choose a plan." }).int().positive("Choose a plan."),
  validityDays: z.coerce
    .number({ error: "Validity must be a whole number of days." })
    .int("Validity must be a whole number of days.")
    .min(1, "Validity must be at least 1 day.")
    .max(3650, "Validity can be at most 3650 days."),
  notes: z
    .string()
    .trim()
    .max(5000, "Keep the notes under 5000 characters.")
    .transform((value) => value || null),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one product line.")
    .max(MAX_LINES, `A template can have at most ${MAX_LINES} lines.`),
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

export async function saveTemplate(_prev: TemplateFormState, formData: FormData): Promise<TemplateFormState> {
  await requireTeam();

  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { error: "This template could not be found." };

  const rawLines = parseLines(formData.get("lines"));
  const parsed = templateSchema.safeParse({
    name: String(formData.get("name") ?? ""),
    planId: formData.get("planId") ?? "",
    validityDays: formData.get("validityDays") ?? "",
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
        const key = String(row?.key ?? index);
        lineErrors[key] ??= issue.message;
      } else if (typeof field === "string") {
        fieldErrors[field as FieldName] ??= issue.message;
      }
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, lineErrors };
  }

  const { name, planId, validityDays, notes, lines } = parsed.data;

  if (id) {
    const exists = await db.quotationTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return { error: "This template no longer exists. It may have been deleted." };
  }

  const [plan, products] = await Promise.all([
    db.plan.findUnique({ where: { id: planId }, select: { name: true, active: true, minQuantity: true } }),
    db.product.findMany({
      where: { id: { in: [...new Set(lines.map((line) => line.productId))] } },
      select: { id: true, name: true, active: true, variants: { select: { id: true } } },
    }),
  ]);

  const fieldErrors: Partial<Record<FieldName, string>> = {};
  const lineErrors: Record<string, string> = {};

  if (!plan) fieldErrors.planId = "That plan no longer exists. Choose another.";
  else if (!plan.active) fieldErrors.planId = `${plan.name} is inactive. Choose an active plan.`;

  const productsById = new Map(products.map((product) => [product.id, product]));
  const seen = new Set<string>();
  for (const line of lines) {
    const product = productsById.get(line.productId);
    const pair = `${line.productId}:${line.variantId ?? ""}`;
    if (!product) {
      lineErrors[line.key] = "This product no longer exists.";
    } else if (!product.active) {
      lineErrors[line.key] = `${product.name} is inactive. Choose an active product.`;
    } else if (line.variantId !== null && !product.variants.some((variant) => variant.id === line.variantId)) {
      lineErrors[line.key] = `That variant does not belong to ${product.name}.`;
    } else if (plan && line.quantity < plan.minQuantity) {
      lineErrors[line.key] = `${plan.name} needs a quantity of at least ${plan.minQuantity} per line.`;
    } else if (seen.has(pair)) {
      lineErrors[line.key] = "This product and variant is already on another line. Raise the quantity there instead.";
    }
    seen.add(pair);
  }

  if (Object.keys(fieldErrors).length || Object.keys(lineErrors).length) {
    return { error: "Please fix the highlighted fields.", fieldErrors, lineErrors };
  }

  const data = { name, planId, validityDays, notes };
  const lineData = lines.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity }));

  try {
    await db.$transaction(async (tx) => {
      if (id) {
        await tx.quotationTemplate.update({ where: { id }, data });
        await tx.quotationTemplateLine.deleteMany({ where: { templateId: id } });
        await tx.quotationTemplateLine.createMany({ data: lineData.map((line) => ({ ...line, templateId: id })) });
      } else {
        await tx.quotationTemplate.create({ data: { ...data, lines: { create: lineData } } });
      }
    });
  } catch (err) {
    // Something was deleted between validation and saving.
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2025" || err.code === "P2003")) {
      return { error: "The template, plan or a product was changed by someone else. Reload the page and try again." };
    }
    throw err;
  }

  revalidatePath("/dashboard/templates");
  if (id) revalidatePath(`/dashboard/templates/${id}`);
  redirect("/dashboard/templates");
}

export async function deleteTemplate(_prev: DeleteTemplateState, formData: FormData): Promise<DeleteTemplateState> {
  await requireTeam();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This template could not be found." };

  // Single statement: only deletes when no subscription points at the template.
  const { count } = await db.quotationTemplate.deleteMany({ where: { id, subscriptions: { none: {} } } });
  if (count === 0) {
    const inUse = await db.subscription.count({ where: { templateId: id } });
    if (inUse > 0) {
      return {
        error: `This template is used by ${inUse} subscription${inUse === 1 ? "" : "s"}, so it can't be deleted.`,
      };
    }
  }

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates");
}
