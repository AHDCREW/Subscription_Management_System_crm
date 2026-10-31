import { formatDate, formatMoney, round2, toNumber } from "../money";
import { lastDayOfPeriod, outstandingAmount, type InvoiceStatusValue } from "./invoice";
import { compareDates } from "./period";

// Pure builders for the emails sent to customers about an invoice: the invoice
// itself and the friendly reminder for an overdue one. No database or mailer
// here; the caller passes plain values and sends the result.

type Numeric = Parameters<typeof toNumber>[0];

export type InvoiceEmailInput = {
  number: string;
  status: InvoiceStatusValue;
  companyName: string;
  currency: string;
  customerName: string;
  invoiceDate: Date;
  dueDate: Date;
  periodStart: Date | null;
  /** Exclusive end, as stored. */
  periodEnd: Date | null;
  total: Numeric;
  amountPaid: Numeric;
  lines: { description: string; quantity: number; amount: Numeric; discountAmount: Numeric; taxAmount: Numeric }[];
  /** Absolute link to the invoice in the customer portal, where it can be paid. */
  portalUrl: string;
};

export type InvoiceEmail = { subject: string; text: string };

/** Lines listed in the email before the rest are summarised as "and N more". */
export const EMAIL_LINE_LIMIT = 5;

/** Only confirmed or paid invoices go to the customer; drafts are internal, cancelled ones are void. */
export function canSendInvoice(status: InvoiceStatusValue): boolean {
  return status === "CONFIRMED" || status === "PAID";
}

/** Whole calendar days between the due date and today (0 when not past due). */
export function daysOverdue(dueDate: Date, today: Date = new Date()): number {
  return Math.max(0, Math.round(compareDates(today, dueDate) / 86_400_000));
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "there";
}

function periodLabel(start: Date | null, end: Date | null) {
  return start && end ? `${formatDate(start)} – ${formatDate(lastDayOfPeriod(end))}` : null;
}

function lineSummary(input: InvoiceEmailInput, money: (v: Numeric) => string) {
  const shown = input.lines.slice(0, EMAIL_LINE_LIMIT).map((line) => {
    const lineTotal = round2(toNumber(line.amount) - toNumber(line.discountAmount) + toNumber(line.taxAmount));
    const qty = line.quantity === 1 ? "" : ` × ${line.quantity}`;
    return `  - ${line.description}${qty}: ${money(lineTotal)}`;
  });
  const more = input.lines.length - shown.length;
  if (more > 0) shown.push(`  - and ${more} more line${more === 1 ? "" : "s"}`);
  return shown;
}

/** "Invoice INV-00042 from Brightloop Software": amount due, dates, lines, totals and the portal link. */
export function buildInvoiceEmail(input: InvoiceEmailInput): InvoiceEmail {
  const money = (value: Numeric) => formatMoney(value, input.currency);
  const balance = outstandingAmount(input.total, input.amountPaid);
  const period = periodLabel(input.periodStart, input.periodEnd);
  const paid = balance === 0;

  const text = [
    `Hi ${firstName(input.customerName)},`,
    "",
    paid
      ? `Here is invoice ${input.number} from ${input.companyName} for your records. It has been paid in full, thank you.`
      : `Here is invoice ${input.number} from ${input.companyName}. The amount due is ${money(balance)}, payable by ${formatDate(input.dueDate)}.`,
    "",
    `Invoice number: ${input.number}`,
    `Invoice date:   ${formatDate(input.invoiceDate)}`,
    `Due date:       ${formatDate(input.dueDate)}`,
    ...(period ? [`Period:         ${period}`] : []),
    "",
    ...(input.lines.length > 0 ? ["Summary", ...lineSummary(input, money), ""] : []),
    `Total:       ${money(input.total)}`,
    `Paid:        ${money(input.amountPaid)}`,
    `Balance due: ${money(balance)}`,
    "",
    paid ? `View the invoice online: ${input.portalUrl}` : `View and pay the invoice online: ${input.portalUrl}`,
    "",
    "Thank you for your business.",
    input.companyName,
  ].join("\n");

  return { subject: `Invoice ${input.number} from ${input.companyName}`, text };
}

/** A friendly nudge for an overdue invoice: how late it is, what is left to pay and the pay link. */
export function buildReminderEmail(input: InvoiceEmailInput, today: Date = new Date()): InvoiceEmail {
  const money = (value: Numeric) => formatMoney(value, input.currency);
  const balance = outstandingAmount(input.total, input.amountPaid);
  const days = daysOverdue(input.dueDate, today);
  const late = `${days} day${days === 1 ? "" : "s"}`;

  const text = [
    `Hi ${firstName(input.customerName)},`,
    "",
    `Just a friendly reminder that invoice ${input.number} from ${input.companyName} was due on ${formatDate(input.dueDate)} and is now ${late} overdue.`,
    `The remaining balance is ${money(balance)}.`,
    "",
    `You can view and pay it online here: ${input.portalUrl}`,
    "",
    "If you have already paid, please ignore this email, and thank you. If anything looks wrong, just reply and we will sort it out.",
    "",
    "Thanks,",
    input.companyName,
  ].join("\n");

  return { subject: `Reminder: invoice ${input.number} is ${late} overdue`, text };
}

