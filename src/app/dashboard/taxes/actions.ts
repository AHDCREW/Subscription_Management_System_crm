"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { readTaxForm, validateTax, type TaxField, type TaxFormValues } from "@/lib/catalog/taxes";

export type TaxActionState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: Partial<Record<TaxField, string>>;
      values?: TaxFormValues;
    }
  | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateTaxes() {
  revalidatePath("/dashboard/taxes");
  revalidatePath("/dashboard/products", "layout");
}

// Creates a tax when the form has no id, otherwise updates that tax.
export async function saveTax(_prev: TaxActionState, formData: FormData): Promise<TaxActionState> {
  await requireAdmin();

  const values = readTaxForm(formData);
  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { error: "This tax could not be found.", values };

  const checked = validateTax(values);
  if (!checked.data) return { error: "Please fix the highlighted fields.", fieldErrors: checked.fieldErrors, values };
  const data = checked.data;

  // MySQL's default collation compares names case-insensitively.
  const clash = await db.tax.findFirst({
    where: { name: data.name, ...(id && { id: { not: id } }) },
    select: { id: true },
  });
  if (clash) {
    return { error: "Please fix the highlighted fields.", fieldErrors: { name: "A tax with this name already exists." }, values };
  }

  if (id) {
    const { count } = await db.tax.updateMany({ where: { id }, data });
    if (count === 0) return { error: "This tax no longer exists.", values };
  } else {
    await db.tax.create({ data });
  }

  revalidateTaxes();
  return { ok: true, message: id ? `Saved ${data.name}.` : `Added ${data.name}.` };
}

// Taxes are referenced by products and subscription lines, so they are deactivated rather than deleted.
export async function setTaxActive(formData: FormData): Promise<TaxActionState> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This tax could not be found." };
  const active = formData.get("active") === "true";

  const tax = await db.tax.findUnique({ where: { id }, select: { name: true } });
  if (!tax) return { error: "This tax no longer exists." };
  await db.tax.update({ where: { id }, data: { active } });

  revalidateTaxes();
  return { ok: true, message: `${tax.name} ${active ? "activated" : "deactivated"}.` };
}

// Only unused taxes can be deleted; the schema would otherwise silently clear them from products and lines.
export async function deleteTax(formData: FormData): Promise<TaxActionState> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This tax could not be found." };

  const tax = await db.tax.findUnique({ where: { id }, select: { name: true } });
  if (!tax) return { error: "This tax no longer exists." };

  const { count } = await db.tax.deleteMany({
    where: { id, products: { none: {} }, subscriptionLines: { none: {} } },
  });
  if (count === 0) return { error: `${tax.name} is in use, so it can't be deleted. Deactivate it instead.` };

  revalidateTaxes();
  return { ok: true, message: `Deleted ${tax.name}.` };
}
