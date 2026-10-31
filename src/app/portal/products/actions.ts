"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  MAX_OPEN_REQUESTS,
  OPEN_REQUEST,
  REQUEST_MAX_LINES,
  checkQuoteRequest,
  type RequestFieldErrors,
} from "@/lib/subscriptions/quote-requests";
import { addDays, parseDateInput, subscriptionNumber, todayUtc } from "@/lib/subscriptions/subscriptions";

type FieldName = keyof RequestFieldErrors | "templateId" | "notes";

export type RequestQuotationResult =
  | { ok: true; id: number; number: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Partial<Record<FieldName, string>>;
      // Keyed by the client-side row key so errors stay on the right row.
      lineErrors?: Record<string, string>;
    };

const optionalId = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number().int().positive().nullable(),
);

// No prices or taxes: the customer only says what they want, the server prices it.
const lineSchema = z.object({
  key: z.coerce.string(),
  productId: z.coerce.number({ error: "Choose a product." }).int().positive("Choose a product."),
  variantId: optionalId,
  quantity: z.coerce
    .number({ error: "Quantity must be a whole number." })
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(100000, "Quantity is too large."),
});

const requestSchema = z.object({
  planId: z.coerce.number({ error: "Choose a plan." }).int().positive("Choose a plan."),
  templateId: optionalId,
  startDate: z
    .string()
    .trim()
    .refine((value) => parseDateInput(value) !== null, "Enter a valid start date.")
    .transform((value) => parseDateInput(value) as Date),
  notes: z
    .string()
    .trim()
    .max(2000, "Keep the note under 2000 characters.")
    .transform((value) => value || null),
  lines: z
    .array(lineSchema)
    .min(1, "Add at least one product.")
    .max(REQUEST_MAX_LINES, `A request can have at most ${REQUEST_MAX_LINES} lines.`),
});

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
): RequestQuotationResult => ({ ok: false, error: "Please fix the highlighted fields.", fieldErrors, lineErrors });

// A customer asks for a quotation. It is saved as a Draft marked `requestedAt`
// for the team to review, price and send; the customer never confirms it here.
export async function requestQuotation(formData: FormData): Promise<RequestQuotationResult> {
  const user = await requireCustomer();

  const rawLines = parseLines(formData.get("lines"));
  const parsed = requestSchema.safeParse({
    planId: formData.get("planId") ?? "",
    templateId: formData.get("templateId") ?? "",
    startDate: String(formData.get("startDate") ?? ""),
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

  const { planId, templateId, startDate, notes, lines } = parsed.data;
  const today = todayUtc();

  const [plan, template, products] = await Promise.all([
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
        salesPrice: true,
        taxId: true,
        tax: { select: { active: true } },
        variants: { select: { id: true, attribute: true, value: true, extraPrice: true } },
      },
    }),
  ]);

  if (templateId && !template) {
    return invalid({ templateId: "That package is no longer available. Choose another or build your own." });
  }
  const check = checkQuoteRequest({ plan, startDate, lines, products, today });
  if (!check.ok) return invalid(check.fieldErrors, check.lineErrors);

  const lineData = check.lines.map((line) => ({
    ...line,
    description: line.description.slice(0, 255),
    unitPrice: new Prisma.Decimal(line.unitPrice.toFixed(2)),
  }));

  try {
    const saved = await db.$transaction(async (tx) => {
      // Lock the customer's row first, so two quick submits queue here and the
      // second one counts the first one's request.
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${user.id} FOR UPDATE`;
      const open = await tx.subscription.count({ where: { customerId: user.id, ...OPEN_REQUEST } });
      if (open >= MAX_OPEN_REQUESTS) return null;

      // Same numbering as the team's form: a throwaway unique number, then
      // SUB-00001 from the auto-increment id, inside one transaction.
      const created = await tx.subscription.create({
        data: {
          number: `TMP-${randomBytes(8).toString("hex")}`,
          customerId: user.id,
          planId,
          templateId,
          status: "DRAFT",
          requestedAt: new Date(),
          startDate,
          nextInvoiceDate: startDate,
          notes,
          quotationExpiresAt: template ? addDays(today, template.validityDays) : null,
          lines: { create: lineData },
        },
        select: { id: true },
      });
      const number = subscriptionNumber(created.id);
      await tx.subscription.update({ where: { id: created.id }, data: { number } });
      return { id: created.id, number };
    });

    if (!saved) {
      return {
        ok: false,
        error: `You already have ${MAX_OPEN_REQUESTS} requests with our team. Wait for a quotation, or withdraw one, before sending another.`,
      };
    }

    revalidatePath("/portal", "layout");
    revalidatePath("/dashboard", "layout");
    return { ok: true, ...saved };
  } catch (err) {
    // A plan, product or template was deleted between the checks and saving.
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2025" || err.code === "P2003")) {
      return { ok: false, error: "Our catalog just changed. Reload the page and try again." };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "Could not assign a request number. Please try again." };
    }
    throw err;
  }
}
