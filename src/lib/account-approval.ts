import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { appUrl, escapeHtml, sendMail } from "@/lib/mail";

// Customers who signed up themselves and are waiting for an admin or staff
// member to approve them, and customers who can log in and be billed.
export const PENDING_CUSTOMERS: Prisma.UserWhereInput = { role: "CUSTOMER", approvedAt: null };
export const APPROVED_CUSTOMERS: Prisma.UserWhereInput = { role: "CUSTOMER", approvedAt: { not: null } };

export function countPendingCustomers() {
  return db.user.count({ where: PENDING_CUSTOMERS });
}

// Best effort: the approval is already saved, so a failed email is logged and
// reported as `false`, never thrown.
export async function sendAccountApprovedEmail(user: { name: string; email: string }): Promise<boolean> {
  try {
    const company = await db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } });
    const companyName = company?.name ?? "Brightloop Software";
    const link = appUrl("/login");
    await sendMail({
      to: user.email,
      subject: `Your ${companyName} account is approved`,
      text:
        `Hi ${user.name},\n\n` +
        `Good news: your ${companyName} account has been approved. You can log in here:\n\n${link}\n\n` +
        `Use the email and password you signed up with.`,
      html:
        `<p>Hi ${escapeHtml(user.name)},</p>` +
        `<p>Good news: your ${escapeHtml(companyName)} account has been approved.</p>` +
        `<p><a href="${link}">Log in to your account</a></p>` +
        `<p>Use the email and password you signed up with.</p>`,
    });
    return true;
  } catch (err) {
    console.error("[account-approval] could not send the approval email", err);
    return false;
  }
}
