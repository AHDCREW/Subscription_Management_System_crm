"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { dateOrderError, planSchema, readPlanForm, type PlanField, type PlanFormValues } from "@/lib/catalog/plans";

export type PlanFormState =
  | {
      error?: string;
      fieldErrors?: Partial<Record<PlanField, string>>;
      values?: PlanFormValues;
    }
  | undefined;

export type PlanDeleteState = { error?: string } | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidatePlans(id?: number) {
  revalidatePath("/dashboard/plans");
  if (id) revalidatePath(`/dashboard/plans/${id}`);
}

// Creates a plan when the form has no id, otherwise updates that plan.
export async function savePlan(_prev: PlanFormState, formData: FormData): Promise<PlanFormState> {
  await requireAdmin();

  const values = readPlanForm(formData);
  const rawId = formData.get("id");
  const id = rawId ? parseId(rawId) : null;
  if (rawId && !id) return { error: "This plan could not be found.", values };

  const parsed = planSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<PlanField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as PlanField] = messages[0];
    }
    fieldErrors.endDate ??= dateOrderError(values);
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const data = parsed.data;

  if (id) {
    const { count } = await db.plan.updateMany({ where: { id }, data });
    if (count === 0) return { error: "This plan no longer exists.", values };
  } else {
    await db.plan.create({ data });
  }

  revalidatePlans(id ?? undefined);
  redirect("/dashboard/plans");
}

// Plans in use are deactivated rather than deleted: subscriptions and templates point at them.
export async function setPlanActive(formData: FormData): Promise<void> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return;
  const active = formData.get("active") === "true";

  await db.plan.updateMany({ where: { id }, data: { active } });
  revalidatePlans(id);
}

// Only a plan no subscription or quotation template has used can be deleted.
export async function deletePlan(_prev: PlanDeleteState, formData: FormData): Promise<PlanDeleteState> {
  await requireAdmin();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This plan could not be found." };

  const plan = await db.plan.findUnique({
    where: { id },
    select: { _count: { select: { subscriptions: true, templates: true } } },
  });
  if (!plan) return { error: "This plan no longer exists." };
  if (plan._count.subscriptions > 0 || plan._count.templates > 0) {
    return { error: "This plan is in use by subscriptions or templates. Deactivate it instead." };
  }

  try {
    await db.plan.delete({ where: { id } });
  } catch {
    // A subscription or template picked the plan between the check and the delete.
    return { error: "This plan is now in use and can't be deleted. Deactivate it instead." };
  }

  revalidatePlans();
  redirect("/dashboard/plans");
}
