// Emails invoices and overdue reminders to customers.
//
// Server-side only (Prisma + the mailer). The email text comes from the pure
// builders in ./invoice-email; this file loads the invoice, sends the mail and,
// for the invoice itself, stamps sentAt once the mail has gone out.

import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { appUrl, sendMail } from "../mail";
import { isInvoiceOverdue } from "./invoice";
import { buildInvoiceEmail, buildReminderEmail, canSendInvoice, type InvoiceEmailInput } from "./invoice-email";
import { toUtcDate } from "./period";

export type SendResult = { ok: true; to: string } | { ok: false; error: string };

const emailInclude = {
  customer: { select: { name: true, email: true } },
  lines: {
    orderBy: { id: "asc" },
    select: { description: true, quantity: true, amount: true, discountAmount: true, taxAmount: true },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceForEmail = Prisma.InvoiceGetPayload<{ include: typeof emailInclude }>;

async function loadCompany() {
  const company = await db.companySettings.findUnique({ where: { id: 1 }, select: { name: true, currency: true } });
  return { name: company?.name ?? "Brightloop Software", currency: company?.currency ?? "INR" };
}

function toEmailInput(invoice: InvoiceForEmail, company: { name: string; currency: string }): InvoiceEmailInput {
  return {
    number: invoice.number,
    status: invoice.status,
    companyName: company.name,
    currency: company.currency,
    customerName: invoice.customer.name,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    total: invoice.total,
    amountPaid: invoice.amountPaid,
    lines: invoice.lines,
    portalUrl: appUrl(`/portal/invoices/${invoice.id}`),
  };
}

function mailError(error: unknown) {
  console.error("[invoice-email] sending failed:", error);
  return "The email could not be sent. Check the mail settings and try again.";
}

/** Emails a confirmed or paid invoice to its customer, then sets sentAt. sentAt is untouched if the mail fails. */
export async function sendInvoice(id: number): Promise<SendResult> {
  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: emailInclude }),
    loadCompany(),
  ]);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (!canSendInvoice(invoice.status)) {
    return { ok: false, error: "Only confirmed or paid invoices can be sent to the customer." };
  }

  try {
    await sendMail({ to: invoice.customer.email, ...buildInvoiceEmail(toEmailInput(invoice, company)) });
  } catch (error) {
    return { ok: false, error: mailError(error) };
  }
  await db.invoice.update({ where: { id }, data: { sentAt: new Date() } });
  return { ok: true, to: invoice.customer.email };
}

/** Emails a payment reminder for one overdue invoice. */
export async function sendOverdueReminder(id: number, now: Date = new Date()): Promise<SendResult> {
  const [invoice, company] = await Promise.all([
    db.invoice.findUnique({ where: { id }, include: emailInclude }),
    loadCompany(),
  ]);
  if (!invoice) return { ok: false, error: "Invoice not found." };
  if (!isInvoiceOverdue(invoice, now)) return { ok: false, error: "This invoice isn't overdue, so no reminder was sent." };

  try {
    await sendMail({ to: invoice.customer.email, ...buildReminderEmail(toEmailInput(invoice, company), now) });
  } catch (error) {
    return { ok: false, error: mailError(error) };
  }
  return { ok: true, to: invoice.customer.email };
}

/** Same rule as the Overdue tab: confirmed, not fully paid, due before today. */
export function overdueInvoiceWhere(now: Date = new Date()): Prisma.InvoiceWhereInput {
  return { status: "CONFIRMED", dueDate: { lt: toUtcDate(now) }, amountPaid: { lt: db.invoice.fields.total } };
}

/**
 * Reminds every overdue invoice's customer, one email per invoice, one after
 * another. A failed email is counted and the rest still go out. `ids` limits
 * the run to those invoices (still only the overdue ones among them).
 */
export async function sendOverdueReminders(
  options: { ids?: number[]; now?: Date } = {},
): Promise<{ sent: number; failed: number }> {
  const now = options.now ?? new Date();
  const invoices = await db.invoice.findMany({
    where: { AND: [overdueInvoiceWhere(now), options.ids ? { id: { in: options.ids } } : {}] },
    orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    include: emailInclude,
  });
  if (invoices.length === 0) return { sent: 0, failed: 0 };

  const company = await loadCompany();
  let sent = 0;
  let failed = 0;
  for (const invoice of invoices) {
    try {
      await sendMail({ to: invoice.customer.email, ...buildReminderEmail(toEmailInput(invoice, company), now) });
      sent++;
    } catch (error) {
      mailError(error);
      failed++;
    }
  }
  return { sent, failed };
}

