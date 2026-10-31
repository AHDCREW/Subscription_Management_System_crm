"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { productSchema, readProductForm, type ProductField, type ProductFormValues } from "@/lib/catalog/products";
import {
  createVariant,
  deleteVariant,
  readVariantForm,
  updateVariant,
  type VariantField,
  type VariantFormValues,
} from "@/lib/catalog/variants";

export type ProductFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<ProductField, string>>;
      values?: ProductFormValues;
    }
  | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Creates a product when the form has no id, otherwise updates that product.
export async function saveProduct(_prev: ProductFormState, formData: FormData): Promise<ProductFormState> {
  await requireAdmin();

  const values = readProductForm(formData);
  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { error: "This product could not be found.", values };

  const parsed = productSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<ProductField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as ProductField] = messages[0];
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const data = parsed.data;

  const existing = id ? await db.product.findUnique({ where: { id }, select: { taxId: true } }) : null;
  if (id && !existing) return { error: "This product no longer exists.", values };

  // A default tax must be an active tax, unless the product already had it before it was deactivated.
  if (data.taxId !== null && data.taxId !== existing?.taxId) {
    const tax = await db.tax.findUnique({ where: { id: data.taxId }, select: { active: true } });
    if (!tax || !tax.active) {
      return { error: "Please fix the highlighted fields.", fieldErrors: { taxId: "Choose an active tax." }, values };
    }
  }

  if (id) {
    await db.product.update({ where: { id }, data });
    revalidatePath(`/dashboard/products/${id}`);
  } else {
    await db.product.create({ data });
  }

  revalidatePath("/dashboard/products");
  redirect("/dashboard/products");
}

// Products are never deleted (subscriptions and invoices point at them); they are deactivated instead.
export async function setProductActive(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return;
  const active = formData.get("active") === "true";

  await db.product.updateMany({ where: { id }, data: { active } });

  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${id}`);
}

export type VariantActionState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: Partial<Record<VariantField, string>>;
      values?: VariantFormValues;
    }
  | undefined;

function revalidateVariants(productId: number) {
  revalidatePath("/dashboard/products");
  revalidatePath(`/dashboard/products/${productId}`);
}

// Adds a variant when the form has no variantId, otherwise edits that variant.
export async function saveVariant(_prev: VariantActionState, formData: FormData): Promise<VariantActionState> {
  await requireAdmin();

  const values = readVariantForm(formData);
  const productId = parseId(formData.get("productId"));
  if (!productId) return { error: "This product could not be found.", values };
  const rawVariantId = formData.get("variantId");
  const variantId = rawVariantId ? parseId(rawVariantId) : null;
  if (rawVariantId && !variantId) return { error: "This variant could not be found.", values };

  const result = variantId ? await updateVariant(productId, variantId, values) : await createVariant(productId, values);
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors, values };

  revalidateVariants(productId);
  const name = `${result.variant.attribute}: ${result.variant.value}`;
  return { ok: true, message: variantId ? `Saved ${name}.` : `Added ${name}.` };
}

// Refuses (with a reason) when subscription or template lines still use the variant.
export async function removeVariant(_prev: VariantActionState, formData: FormData): Promise<VariantActionState> {
  await requireAdmin();

  const productId = parseId(formData.get("productId"));
  const variantId = parseId(formData.get("variantId"));
  if (!productId || !variantId) return { error: "This variant could not be found." };

  const result = await deleteVariant(productId, variantId);
  if (!result.ok) return { error: result.error };

  revalidateVariants(productId);
  return { ok: true, message: `Deleted ${result.variant.attribute}: ${result.variant.value}.` };
}
