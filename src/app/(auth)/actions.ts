"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, homeFor, verifyPassword } from "@/lib/auth";
import { passwordErrors } from "@/lib/password";

export type AuthState = { error?: string; email?: string; name?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password.", email };
  }

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// Public signup always creates a Customer. Only the admin can add staff.
export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name) return { error: "Please enter your name.", email, name };
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address.", email, name };
  const missing = passwordErrors(password);
  if (missing.length) return { error: `Password needs: ${missing.join(", ").toLowerCase()}.`, email, name };
  if (password !== confirm) return { error: "Passwords do not match.", email, name };

  try {
    const user = await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), role: "CUSTOMER" },
    });
    await createSession(user.id);
  } catch (err) {
    // The unique index on email is the final guard against duplicate accounts.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An account with this email already exists. Try logging in.", email, name };
    }
    throw err;
  }

  redirect("/portal");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
