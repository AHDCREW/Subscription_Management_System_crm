"use server";

import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TransitionResult } from "@/lib/subscriptions/transitions";

// Customers switch add-on products on and off on their own running
// subscriptions. Only lines for ADDON products are ever touched; the plan's
// other products stay exactly as the team set them up.

const MANAGEABLE = ["ACTIVE", "PAUSED"] as const;

function isId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function setMyAddon(subscriptionId: number, productId: number, on: boolean): Promise<TransitionResult> {
  const user = await requireCustomer();
  if (!isId(subscriptionId) || !isId(productId) || typeof on !== "boolean") {
    return { ok: false, error: "Invalid request." };
  }

  // Turning one on needs an add-on that's still sold; one that has since been
  // retired can still be switched off. Never a non-add-on product.
  const product = await db.product.findFirst({
    where: { id: productId, type: "ADDON", ...(on ? { active: true } : {}) },
    select: { id: true, name: true, salesPrice: true, taxId: true },
  });
  if (!product) return { ok: false, error: "That add-on isn't available." };

  // Scoped to the signed-in customer: another customer's id is "not found".
  const scope = { id: subscriptionId, customerId: user.id };

  const result = await db.$transaction(async (tx): Promise<TransitionResult> => {
    // Lock the subscription row before reading anything, so a second click
    // waits here and then sees the first click's line. (MySQL fixes a
    // transaction's read snapshot at its first plain read, so the lock has to
    // come first.) The status condition re-checks it is still running.
    const locked = await tx.subscription.updateMany({
      where: { ...scope, status: { in: [...MANAGEABLE] } },
      data: { updatedAt: new Date() },
    });
    if (locked.count === 0) {
      const visible = await tx.subscription.count({ where: { ...scope, status: { not: "DRAFT" } } });
      return visible
        ? { ok: false, error: "Add-ons can only be changed on an active or paused subscription." }
        : { ok: false, error: "Subscription not found." };
    }

    const { number } = await tx.subscription.findUniqueOrThrow({ where: { id: subscriptionId }, select: { number: true } });
    const existing = await tx.subscriptionLine.count({ where: { subscriptionId, productId: product.id } });

    if (on) {
      if (existing > 0) return { ok: true, message: `${product.name} is already on.` };
      await tx.subscriptionLine.create({
        data: {
          subscriptionId,
          productId: product.id,
          quantity: 1,
          unitPrice: product.salesPrice,
          taxId: product.taxId,
        },
      });
      return { ok: true, message: `${product.name} added to ${number}. It's billed from your next invoice.` };
    }

    if (existing === 0) return { ok: true, message: `${product.name} is already off.` };
    await tx.subscriptionLine.deleteMany({ where: { subscriptionId, productId: product.id } });
    return { ok: true, message: `${product.name} removed from ${number}. It won't be on your next invoice.` };
  });

  if (result.ok) {
    revalidatePath("/portal", "layout");
    revalidatePath("/dashboard/subscriptions");
    revalidatePath(`/dashboard/subscriptions/${subscriptionId}`);
  }
  return result;
}
