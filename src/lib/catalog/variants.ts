import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { money } from "./products";

// Product variants: an attribute + value that adds an extra price on top of the product,
// e.g. Brand = Odoo (+560). Line price = product sales price + variant extra price.

function label(name: string) {
  return z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(
      z
        .string()
        .min(1, `${name} is required.`)
        .max(80, `${name} must be 80 characters or fewer.`),
    );
}

export const variantSchema = z.object({
  attribute: label("Attribute"),
  value: label("Value"),
  extraPrice: money("Extra price", false),
});

export type VariantInput = z.infer<typeof variantSchema>;
export type VariantField = keyof VariantInput;
export type VariantFormValues = Record<VariantField, string>;

export type VariantResult =
  | { ok: true; variant: { id: number; attribute: string; value: string } }
  | { ok: false; error: string; fieldErrors?: Partial<Record<VariantField, string>> };

export function readVariantForm(formData: FormData): VariantFormValues {
  const text = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return { attribute: text("attribute"), value: text("value"), extraPrice: text("extraPrice") };
}

function isUniqueClash(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function duplicate(input: VariantInput): VariantResult {
  return {
    ok: false,
    error: `This product already has the variant ${input.attribute}: ${input.value}.`,
    fieldErrors: { value: `${input.attribute} already has a “${input.value}” value.` },
  };
}

// Reuse the existing spelling of an attribute ("brand" -> "Brand") so variants group together.
// MySQL's default collation compares case-insensitively, so the unique key already treats them as equal.
async function canonicalAttribute(productId: number, attribute: string, exceptId?: number) {
  const match = await db.productVariant.findFirst({
    where: { productId, attribute, ...(exceptId && { id: { not: exceptId } }) },
    select: { attribute: true },
  });
  return match?.attribute ?? attribute;
}

function validate(values: VariantFormValues) {
  const parsed = variantSchema.safeParse(values);
  if (parsed.success) return { data: parsed.data } as const;
  const fieldErrors: Partial<Record<VariantField, string>> = {};
  for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
    if (messages?.length) fieldErrors[field as VariantField] = messages[0];
  }
  return { result: { ok: false, error: "Please fix the highlighted fields.", fieldErrors } satisfies VariantResult } as const;
}

export async function createVariant(productId: number, values: VariantFormValues): Promise<VariantResult> {
  const checked = validate(values);
  if (!checked.data) return checked.result;

  const product = await db.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) return { ok: false, error: "This product no longer exists." };

  const data = { ...checked.data, attribute: await canonicalAttribute(productId, checked.data.attribute) };
  try {
    const variant = await db.productVariant.create({
      data: { ...data, productId },
      select: { id: true, attribute: true, value: true },
    });
    return { ok: true, variant };
  } catch (err) {
    if (isUniqueClash(err)) return duplicate(data);
    throw err;
  }
}

export async function updateVariant(
  productId: number,
  variantId: number,
  values: VariantFormValues,
): Promise<VariantResult> {
  const checked = validate(values);
  if (!checked.data) return checked.result;

  const data = {
    ...checked.data,
    attribute: await canonicalAttribute(productId, checked.data.attribute, variantId),
  };
  try {
    const { count } = await db.productVariant.updateMany({ where: { id: variantId, productId }, data });
    if (count === 0) return { ok: false, error: "This variant no longer exists." };
    return { ok: true, variant: { id: variantId, attribute: data.attribute, value: data.value } };
  } catch (err) {
    if (isUniqueClash(err)) return duplicate(data);
    throw err;
  }
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// The schema would quietly null out variantId on lines that use the variant, changing what was sold.
// Refuse instead and tell the admin where it is still used.
export async function deleteVariant(productId: number, variantId: number): Promise<VariantResult> {
  const variant = await db.productVariant.findFirst({
    where: { id: variantId, productId },
    select: {
      id: true,
      attribute: true,
      value: true,
      _count: { select: { subscriptionLines: true, templateLines: true } },
    },
  });
  if (!variant) return { ok: false, error: "This variant no longer exists." };

  const refuse = (subs: number, templates: number): VariantResult => {
    const uses = [
      subs && plural(subs, "subscription line"),
      templates && plural(templates, "quotation template line"),
    ].filter(Boolean);
    return {
      ok: false,
      error: `${variant.attribute}: ${variant.value} can't be deleted because it is used on ${uses.join(" and ")}. Remove it from those lines first.`,
    };
  };

  const { subscriptionLines, templateLines } = variant._count;
  if (subscriptionLines || templateLines) return refuse(subscriptionLines, templateLines);

  // Only delete while still unused, in case a line picked it up since the check above.
  const { count } = await db.productVariant.deleteMany({
    where: { id: variantId, productId, subscriptionLines: { none: {} }, templateLines: { none: {} } },
  });
  if (count === 0) {
    const now = await db.productVariant.findUnique({
      where: { id: variantId },
      select: { _count: { select: { subscriptionLines: true, templateLines: true } } },
    });
    if (!now) return { ok: false, error: "This variant no longer exists." };
    return refuse(now._count.subscriptionLines, now._count.templateLines);
  }
  return { ok: true, variant: { id: variant.id, attribute: variant.attribute, value: variant.value } };
}
