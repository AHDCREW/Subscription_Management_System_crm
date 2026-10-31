"use server";

import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { createSession, destroySession, hashPassword, homeFor, isApproved, verifyPassword } from "@/lib/auth";
import { passwordErrors } from "@/lib/password";
import { findValidResetToken, sendPasswordResetLink } from "@/lib/password-reset";

export type AuthState = { error?: string; pending?: boolean; email?: string; name?: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Incorrect email or password.", email };
  }
  // Only reached with the right password, so it doesn't reveal which emails exist.
  if (!isApproved(user)) return { pending: true, email };

  await createSession(user.id);
  redirect(homeFor(user.role));
}

// Public signup always creates a Customer. Only the admin can add staff.
// The new account waits for an admin or staff member to approve it, so no
// session is created here.
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
    await db.user.create({
      data: { name, email, passwordHash: await hashPassword(password), role: "CUSTOMER", approvedAt: null },
    });
  } catch (err) {
    // The unique index on email is the final guard against duplicate accounts.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { error: "An account with this email already exists. Try logging in.", email, name };
    }
    throw err;
  }

  redirect("/signup/pending");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

export type ForgotState = { sent?: boolean; error?: string; email?: string } | undefined;

// Always answers with the same message so nobody can probe which emails exist.
export async function forgotPassword(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { error: "Please enter a valid email address.", email };

  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, email: true } });
  if (user) {
    try {
      await sendPasswordResetLink(user);
    } catch (err) {
      // Log it, but keep the response identical to the "no account" case.
      console.error("[forgot-password] could not send reset email", err);
    }
  }
  return { sent: true, email };
}

export type ResetState = { error?: string; invalid?: boolean } | undefined;

export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const resetToken = await findValidResetToken(token);
  if (!resetToken) return { invalid: true };

  const missing = passwordErrors(password);
  if (missing.length) return { error: `Password needs: ${missing.join(", ").toLowerCase()}.` };
  if (password !== confirm) return { error: "Passwords do not match." };

  const passwordHash = await hashPassword(password);
  const now = new Date();

  const done = await db.$transaction(async (tx) => {
    // Claim the token atomically so two submits can't both use it.
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;

    await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
    // Log out everywhere: the old password may have been compromised.
    await tx.session.deleteMany({ where: { userId: resetToken.userId } });
    return true;
  });
  if (!done) return { invalid: true };

  redirect("/login?reset=1");
}
