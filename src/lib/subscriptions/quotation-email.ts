import type { BillingPeriod } from "@prisma/client";
import { formatMoney, toNumber } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { formatDay, lineSubtotal, paymentTermsLabel, subscriptionTotals } from "@/lib/subscriptions/subscriptions";

// The email a customer receives when a quotation is sent. A pure function of
// the subscription data, so it is unit tested without a database or SMTP.

type Numeric = Parameters<typeof toNumber>[0];

export type QuotationEmailInput = {
  number: string;
  customerName: string;
  companyName: string;
  currency?: string;
  planName: string;
  planPrice: Numeric;
  billingPeriod: BillingPeriod;
  paymentTermDays: number;
  quotationExpiresAt: Date | null;
  lines: {
    product: string;
    variant?: string | null;
    quantity: number;
    unitPrice: Numeric;
    taxRate?: Numeric;
  }[];
  // Absolute link to the quotation in the customer portal.
  link: string;
};

export type QuotationEmail = { subject: string; text: string; html: string };

export function buildQuotationEmail(input: QuotationEmailInput): QuotationEmail {
  const money = (value: Numeric) => formatMoney(value, input.currency ?? "INR");
  const totals = subscriptionTotals(input.planPrice, input.lines);
  const unit = PERIOD_UNIT[input.billingPeriod];
  const period = PERIOD_LABEL[input.billingPeriod];
  const validUntil = formatDay(input.quotationExpiresAt);
  const terms = paymentTermsLabel(input.paymentTermDays);
  const lines = input.lines.map((line) => ({
    name: line.variant ? `${line.product} (${line.variant})` : line.product,
    quantity: line.quantity,
    unitPrice: money(line.unitPrice),
    amount: money(lineSubtotal(line)),
  }));

  const subject = `Quotation ${input.number} from ${input.companyName}`;
  const intro = `Please find your quotation ${input.number} for ${input.planName}, billed ${period.toLowerCase()}.`;
  const summary: [string, string][] = [
    ["Plan base fee", money(totals.baseFee)],
    ["Products", money(totals.productsSubtotal)],
    ["Tax", money(totals.tax)],
  ];
  const totalLabel = `Total per ${unit}`;

  const text = [
    `Hi ${input.customerName},`,
    "",
    intro,
    "",
    `Plan: ${input.planName} (${period})`,
    "",
    "Lines:",
    ...(lines.length
      ? lines.map((line) => `- ${line.name}: ${line.quantity} x ${line.unitPrice} = ${line.amount}`)
      : ["- No product lines"]),
    "",
    ...summary.map(([label, value]) => `${label}: ${value}`),
    `${totalLabel}: ${money(totals.total)}`,
    "Prices are before any discounts.",
    "",
    `Valid until: ${validUntil}`,
    `Payment terms: ${terms}`,
    "",
    `View and confirm it in your portal: ${input.link}`,
    "",
    "Thank you,",
    input.companyName,
  ].join("\n");

  const ink = "#18181b";
  const muted = "#71717a";
  const rule = "#e4e4e7";
  const cell = `padding:8px 0;border-bottom:1px solid ${rule};`;
  const right = "text-align:right;font-variant-numeric:tabular-nums;";
  const th = `padding:8px 0;border-bottom:1px solid ${ink};font-size:12px;font-weight:normal;color:${muted};`;

  const lineRows = lines.length
    ? lines
        .map(
          (line) =>
            `<tr><td style="${cell}">${esc(line.name)}</td>` +
            `<td style="${cell}${right}">${line.quantity}</td>` +
            `<td style="${cell}${right}">${esc(line.unitPrice)}</td>` +
            `<td style="${cell}${right}">${esc(line.amount)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" style="${cell}color:${muted};">No product lines</td></tr>`;

  const summaryRows =
    summary
      .map(
        ([label, value]) =>
          `<tr><td style="padding:4px 0;color:${muted};">${label}</td><td style="padding:4px 0;${right}color:${muted};">${esc(value)}</td></tr>`,
      )
      .join("") +
    `<tr><td style="padding:8px 0 0;border-top:1px solid ${ink};font-weight:600;">${totalLabel}</td>` +
    `<td style="padding:8px 0 0;border-top:1px solid ${ink};${right}font-weight:600;">${esc(money(totals.total))}</td></tr>`;

  const html =
    `<div style="background:#fafafa;padding:24px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${ink};font-size:14px;line-height:1.5;">` +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid ${rule};border-radius:12px;padding:32px;">` +
    `<p style="margin:0 0 4px;font-size:12px;color:${muted};">${esc(input.companyName)}</p>` +
    `<h1 style="margin:0 0 24px;font-size:20px;font-weight:600;">Quotation ${esc(input.number)}</h1>` +
    `<p style="margin:0 0 12px;">Hi ${esc(input.customerName)},</p>` +
    `<p style="margin:0 0 24px;">${esc(intro)}</p>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">` +
    `<tr><th style="${th}text-align:left;">Product</th><th style="${th}text-align:right;">Qty</th>` +
    `<th style="${th}text-align:right;">Unit price</th><th style="${th}text-align:right;">Amount</th></tr>` +
    lineRows +
    `</table>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">${summaryRows}</table>` +
    `<p style="margin:8px 0 24px;font-size:12px;color:${muted};">Prices are before any discounts.</p>` +
    `<table role="presentation" style="width:100%;border-collapse:collapse;font-size:14px;">` +
    `<tr><td style="padding:4px 0;color:${muted};">Valid until</td><td style="padding:4px 0;text-align:right;">${esc(validUntil)}</td></tr>` +
    `<tr><td style="padding:4px 0;color:${muted};">Payment terms</td><td style="padding:4px 0;text-align:right;">${esc(terms)}</td></tr>` +
    `</table>` +
    `<p style="margin:24px 0;"><a href="${esc(input.link)}" style="display:inline-block;background:${ink};color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">View quotation</a></p>` +
    `<p style="margin:0;">Thank you,<br>${esc(input.companyName)}</p>` +
    `</div></div>`;

  return { subject, text, html };
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
