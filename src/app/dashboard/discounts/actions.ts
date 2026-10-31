"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import {
  readDiscountForm,
  validateDiscount,
  type DiscountField,
  type DiscountFormValues,
} from "@/lib/catalog/discounts";

export type DiscountActionState =
  | {
      ok?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: Partial<Record<DiscountField, string>>;
      values?: DiscountFormValues;
    }
  | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidateDiscounts(id?: number) {
  revalidatePath("/dashboard/discounts");
  if (id) revalidatePath(`/dashboard/discounts/${id}`);
}

const FIX_FIELDS = "Please fix the highlighted fields.";

// Creates a discount when the form has no id, otherwise updates it. The discount and its
// product list are saved together in one transaction.
export async function saveDiscount(_prev: DiscountActionState, formData: FormData): Promise<DiscountActionState> {
  await requireAdmin();

  const values = readDiscountForm(formData);
  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { error: "This discount could not be found.", values };

  const checked = validateDiscount(values);
  if (!checked.data) return { error: FIX_FIELDS, fieldErrors: checked.fieldErrors, values };
  const { productIds, ...data } = checked.data;

  // MySQL's default collation compares names case-insensitively.
  const clash = await db.discount.findFirst({
    where: { name: data.name, ...(id && { id: { not: id } }) },
    select: { id: true },
  });
  if (clash) return { error: FIX_FIELDS, fieldErrors: { name: "A discount with this name already exists." }, values };

  // Products must be active, unless this discount already covered them before they were deactivated.
  if (productIds.length > 0) {
    const allowed = await db.product.count({
      where: {
        id: { in: productIds },
        OR: [{ active: true }, ...(id ? [{ discounts: { some: { discountId: id } } }] : [])],
      },
    });
    if (allowed !== productIds.length) {
      return { error: FIX_FIELDS, fieldErrors: { productIds: "Some chosen products are no longer available." }, values };
    }
  }

  const savedId = await db.$transaction(async (tx) => {
    let discountId: number;
    if (id) {
      const { count } = await tx.discount.updateMany({ where: { id }, data });
      if (count === 0) return null;
      await tx.discountProduct.deleteMany({ where: { discountId: id } });
      discountId = id;
    } else {
      discountId = (await tx.discount.create({ data, select: { id: true } })).id;
    }
    if (productIds.length > 0) {
      await tx.discountProduct.createMany({ data: productIds.map((productId) => ({ discountId, productId })) });
    }
    return discountId;
  });
  if (!savedId) return { error: "This discount no longer exists.", values };

  revalidateDiscounts(savedId);
  return { ok: true, message: id ? `Saved ${data.name}.` : `Added ${data.name}.` };
}

export async function setDiscountActive(formData: FormData): Promise<DiscountActionState> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This discount could not be found." };
  const active = formData.get("active") === "true";

  const discount = await db.discount.findUnique({ where: { id }, select: { name: true } });
  if (!discount) return { error: "This discount no longer exists." };
  await db.discount.update({ where: { id }, data: { active } });

  revalidateDiscounts(id);
  return { ok: true, message: `${discount.name} ${active ? "activated" : "deactivated"}.` };
}

// Only a discount that was never used and no subscription pins can be deleted; otherwise deactivate it.
export async function deleteDiscount(formData: FormData): Promise<DiscountActionState> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This discount could not be found." };

  const discount = await db.discount.findUnique({ where: { id }, select: { name: true } });
  if (!discount) return { error: "This discount no longer exists." };

  const { count } = await db.discount.deleteMany({ where: { id, usedCount: 0, subscriptions: { none: {} } } });
  if (count === 0) {
    return { error: `${discount.name} has been used or is set on a subscription, so it can't be deleted. Deactivate it instead.` };
  }

  revalidateDiscounts();
  return { ok: true, message: `Deleted ${discount.name}.` };
}
