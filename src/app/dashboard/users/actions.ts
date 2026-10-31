"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireAdmin } from "@/lib/auth";
import { sendPasswordResetLink } from "@/lib/password-reset";

type StaffField = "name" | "email";

export type AddStaffState =
  | {
      ok?: boolean;
      warning?: boolean;
      message?: string;
      error?: string;
      fieldErrors?: Partial<Record<StaffField, string>>;
      values?: Record<StaffField, string>;
    }
  | undefined;

export type RoleChangeState = { ok?: boolean; message?: string; error?: string } | undefined;

const staffSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120, "Name must be 120 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(191, "Email must be 191 characters or fewer.")
    .pipe(z.email("Enter a valid email address.")),
});

function parseId(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// Only the admin can add staff. The new account gets a random password nobody
// knows, and a reset link so the staff member chooses their own.
export async function addStaff(_prev: AddStaffState, formData: FormData): Promise<AddStaffState> {
  await requireAdmin();

  const values = { name: String(formData.get("name") ?? ""), email: String(formData.get("email") ?? "") };
  const parsed = staffSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<StaffField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as StaffField] = messages[0];
    }
    return { fieldErrors, values };
  }
  const { name, email } = parsed.data;

  const taken = { fieldErrors: { email: "Someone already has an account with this email." }, values };
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) return taken;

  let user;
  try {
    user = await db.user.create({
      data: { name, email, role: "STAFF", passwordHash: await hashPassword(randomBytes(32).toString("hex")) },
      select: { id: true, name: true, email: true },
    });
  } catch (err) {
    // The unique index on email is the final guard against duplicates.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return taken;
    throw err;
  }

  revalidatePath("/dashboard/users");

  try {
    await sendPasswordResetLink(user);
  } catch (err) {
    console.error("[add-staff] could not send the set-password email", err);
    return {
      ok: true,
      warning: true,
      message: `Added ${user.name}, but the email didn't go out. They can use "Forgot password" to set one.`,
    };
  }
  return { ok: true, message: `Added ${user.name}. We emailed them a link to set their password.` };
}

// Moves a team member between Staff and Admin. Customers keep their role, and
// an admin can never change their own role.
export async function changeRole(_prev: RoleChangeState, formData: FormData): Promise<RoleChangeState> {
  const admin = await requireAdmin();

  const id = parseId(formData.get("id"));
  const role = formData.get("role");
  if (!id) return { error: "This user could not be found." };
  if (role !== "ADMIN" && role !== "STAFF") return { error: "Choose Admin or Staff." };
  if (id === admin.id) return { error: "You can't change your own role." };

  const { count } = await db.user.updateMany({
    where: { id, role: { in: ["ADMIN", "STAFF"] } },
    data: { role },
  });
  if (count === 0) return { error: "Only staff and admin roles can be changed." };

  const user = await db.user.findUnique({ where: { id }, select: { name: true } });
  revalidatePath("/dashboard/users");
  return { ok: true, message: `${user?.name ?? "User"} is now ${role === "ADMIN" ? "an admin" : "staff"}.` };
}
