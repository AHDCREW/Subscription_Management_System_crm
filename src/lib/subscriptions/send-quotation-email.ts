import "server-only";
import { db } from "@/lib/db";
import { appUrl, sendMail } from "@/lib/mail";
import { buildQuotationEmail } from "@/lib/subscriptions/quotation-email";

/**
 * Email quotation `id` to its customer. Returns the address it went to, or null
 * when the subscription is gone. Throws when delivery fails; callers decide
 * whether that should block anything.
 */
export async function sendQuotationEmail(id: number): Promise<string | null> {
  const [sub, company] = await Promise.all([
    db.subscription.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        paymentTermDays: true,
        quotationExpiresAt: true,
        customer: { select: { name: true, email: true } },
        plan: { select: { name: true, price: true, billingPeriod: true } },
        lines: {
          orderBy: { id: "asc" },
          select: {
            quantity: true,
            unitPrice: true,
            product: { select: { name: true } },
            variant: { select: { attribute: true, value: true } },
            tax: { select: { rate: true } },
          },
        },
      },
    }),
    db.companySettings.findUnique({ where: { id: 1 }, select: { name: true, currency: true } }),
  ]);
  if (!sub) return null;

  const email = buildQuotationEmail({
    number: sub.number,
    customerName: sub.customer.name,
    companyName: company?.name ?? "Brightloop Software",
    currency: company?.currency,
    planName: sub.plan.name,
    planPrice: sub.plan.price,
    billingPeriod: sub.plan.billingPeriod,
    paymentTermDays: sub.paymentTermDays,
    quotationExpiresAt: sub.quotationExpiresAt,
    lines: sub.lines.map((line) => ({
      product: line.product.name,
      variant: line.variant ? `${line.variant.attribute}: ${line.variant.value}` : null,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: line.tax?.rate,
    })),
    link: appUrl(`/portal/subscriptions/${sub.id}`),
  });

  await sendMail({ to: sub.customer.email, ...email });
  return sub.customer.email;
}
