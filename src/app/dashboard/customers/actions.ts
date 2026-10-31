"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requireTeam } from "@/lib/auth";
import { PENDING_CUSTOMERS, sendAccountApprovedEmail } from "@/lib/account-approval";

export type ApprovalState = { ok?: boolean; warning?: boolean; message?: string; error?: string } | undefined;

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard");
}

// Admin or staff lets a customer who signed up log in, then emails them.
export async function approveCustomer(_prev: ApprovalState, formData: FormData): Promise<ApprovalState> {
  const me = await requireTeam();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This customer could not be found." };

  // Guarded update: only a customer who is still waiting is approved, so two
  // people clicking at once send one email.
  const { count } = await db.user.updateMany({
    where: { id, ...PENDING_CUSTOMERS },
    data: { approvedAt: new Date(), approvedById: me.id },
  });
  const user = await db.user.findUnique({ where: { id }, select: { name: true, email: true } });
  if (!user) return { error: "This signup was removed by someone else." };
  if (count === 0) return { error: `${user.name} is already approved.` };

  revalidate();

  if (!(await sendAccountApprovedEmail(user))) {
    return { ok: true, warning: true, message: `Approved ${user.name}, but the email didn't go out. They can log in now.` };
  }
  return { ok: true, message: `Approved ${user.name}. We emailed them a link to log in.` };
}

// Removes a pending signup. Anything billed to the account blocks it, so
// rejecting never deletes subscriptions, invoices or payments.
export async function rejectCustomer(_prev: ApprovalState, formData: FormData): Promise<ApprovalState> {
  await requireTeam();

  const id = parseId(formData.get("id"));
  if (!id) return { error: "This customer could not be found." };

  const user = await db.user.findUnique({ where: { id }, select: { name: true } });
  if (!user) return { error: "This signup was already removed." };

  let count: number;
  try {
    ({ count } = await db.user.deleteMany({
      where: { id, ...PENDING_CUSTOMERS, subscriptions: { none: {} }, invoices: { none: {} } },
    }));
  } catch (err) {
    // A subscription or invoice created in the meantime: the foreign key wins.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") count = 0;
    else throw err;
  }
  if (count === 0) {
    const current = await db.user.findUnique({ where: { id }, select: { approvedAt: true } });
    if (!current) return { error: `${user.name}'s signup was already removed.` };
    if (current.approvedAt) return { error: `${user.name} is already approved, so the signup can't be rejected.` };
    return { error: `${user.name} already has subscriptions or invoices, so the signup can't be rejected.` };
  }

  revalidate();
  return { ok: true, message: `Rejected ${user.name}'s signup and removed the account.` };
}
