import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/auth";
import { appUrl, sendMail } from "@/lib/mail";

// Reset links carry a random token; MySQL only stores its SHA-256 hash.
// A token expires after 30 minutes and works once.
const RESET_MINUTES = 30;

export async function sendPasswordResetLink(user: { id: number; name: string; email: string }) {
  const token = randomBytes(32).toString("hex");
  const now = new Date();

  await db.$transaction([
    // Only the newest link should work: retire any earlier unused ones.
    db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
    db.passwordResetToken.create({
      data: {
        tokenHash: sha256(token),
        userId: user.id,
        expiresAt: new Date(now.getTime() + RESET_MINUTES * 60 * 1000),
      },
    }),
  ]);

  const link = appUrl(`/reset-password?token=${token}`);
  await sendMail({
    to: user.email,
    subject: "Reset your SubFlow password",
    text:
      `Hi ${user.name},\n\n` +
      `We received a request to reset your SubFlow password. Open this link to choose a new one:\n\n${link}\n\n` +
      `The link expires in ${RESET_MINUTES} minutes and can be used once. ` +
      `If you didn't ask for this, you can ignore this email.`,
    html:
      `<p>Hi ${escapeHtml(user.name)},</p>` +
      `<p>We received a request to reset your SubFlow password.</p>` +
      `<p><a href="${link}">Choose a new password</a></p>` +
      `<p>The link expires in ${RESET_MINUTES} minutes and can be used once. ` +
      `If you didn't ask for this, you can ignore this email.</p>`,
  });
}

// Returns the token row when it exists, is unused and has not expired.
export async function findValidResetToken(token: string) {
  if (!token) return null;
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!row || row.usedAt || row.expiresAt <= new Date()) return null;
  return row;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
