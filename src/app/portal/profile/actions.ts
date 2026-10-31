"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, requireCustomer, sha256, verifyPassword } from "@/lib/auth";
import { passwordErrors } from "@/lib/password";

// Same cookie that src/lib/auth.ts sets; it holds the raw session token.
const SESSION_COOKIE = "subflow_session";

// ---- Your details ----

export type DetailsField = "name" | "company" | "phone" | "address";
export type DetailsValues = Record<DetailsField, string>;

export type DetailsState =
  | {
      ok?: boolean;
      error?: string;
      fieldErrors?: Partial<Record<DetailsField, string>>;
      values?: DetailsValues;
    }
  | undefined;

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((v) => v || null);

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Please enter your name.").max(120, "Name must be 120 characters or fewer."),
  company: optional(160, "Company"),
  phone: optional(40, "Phone"),
  address: optional(1000, "Address"),
});

// Only ever updates the signed-in customer's own row.
export async function saveDetails(_prev: DetailsState, formData: FormData): Promise<DetailsState> {
  const user = await requireCustomer();

  const text = (key: DetailsField) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: DetailsValues = {
    name: text("name"),
    company: text("company"),
    phone: text("phone"),
    address: text("address"),
  };

  const parsed = detailsSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<DetailsField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as DetailsField] = messages[0];
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }

  const saved = await db.user.update({
    where: { id: user.id },
    data: parsed.data,
    select: { name: true, company: true, phone: true, address: true },
  });

  // The header shows the customer's name, so refresh the whole portal.
  revalidatePath("/portal", "layout");
  return {
    ok: true,
    values: {
      name: saved.name,
      company: saved.company ?? "",
      phone: saved.phone ?? "",
      address: saved.address ?? "",
    },
  };
}

// ---- Change password ----

export type PasswordField = "current" | "password" | "confirm";

export type PasswordState =
  | {
      ok?: boolean;
      error?: string;
      fieldErrors?: Partial<Record<PasswordField, string>>;
    }
  | undefined;

const passwordSchema = z
  .object({
    current: z.string().min(1, "Enter your current password.").max(200),
    password: z
      .string()
      .max(200, "Password must be 200 characters or fewer.")
      .superRefine((value, ctx) => {
        const missing = passwordErrors(value);
        if (missing.length) ctx.addIssue({ code: "custom", message: `Password needs: ${missing.join(", ").toLowerCase()}.` });
      }),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match." })
  .refine((v) => v.password !== v.current, {
    path: ["password"],
    message: "Choose a password different from your current one.",
  });

// Verifies the current password, stores the new hash and signs out every
// other device. The session making this request stays signed in.
export async function changePassword(_prev: PasswordState, formData: FormData): Promise<PasswordState> {
  const user = await requireCustomer();

  const text = (key: PasswordField) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const parsed = passwordSchema.safeParse({ current: text("current"), password: text("password"), confirm: text("confirm") });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<PasswordField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as PasswordField] = messages[0];
    }
    return { error: "Please fix the highlighted fields.", fieldErrors };
  }
  const { current, password } = parsed.data;

  const row = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!row || !(await verifyPassword(current, row.passwordHash))) {
    return { error: "Your current password is incorrect.", fieldErrors: { current: "Incorrect password." } };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const currentSessionId = token ? sha256(token) : "";
  const passwordHash = await hashPassword(password);

  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash } }),
    db.session.deleteMany({ where: { userId: user.id, id: { not: currentSessionId } } }),
  ]);

  return { ok: true };
}
