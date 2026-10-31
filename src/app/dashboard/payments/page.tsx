import Link from "next/link";
import Form from "next/form";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatMoney, round2, toNumber } from "@/lib/money";
import { addPeriod, parseIsoDate, PAYMENT_METHOD_LABELS, type PaymentMethodValue } from "@/lib/billing";
import { Button, ButtonLink, EmptyState, Field, Input, PageHeader, Select, Table, Td, Th } from "@/components/kit";
import { StatCard } from "@/components/motion";

const PAGE_SIZE = 25;

const METHODS = Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethodValue[];

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function currencySymbol(currency: string) {
  const parts = new Intl.NumberFormat("en-IN", { style: "currency", currency }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? "";
}

export default async function PaymentsPage({ searchParams }: PageProps<"/dashboard/payments">) {
  await requireTeam();

  const params = await searchParams;
  const method = METHODS.find((m) => m === first(params.method)) ?? null;
  const fromDate = parseIsoDate(first(params.from));
  const toDate = parseIsoDate(first(params.to));
  const from = fromDate ? first(params.from).trim() : "";
  const to = toDate ? first(params.to).trim() : "";
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  // Payment dates are stored as midnight UTC, so "to" includes the whole day.
  const dateWhere: Prisma.DateTimeFilter = {};
  if (fromDate) dateWhere.gte = fromDate;
  if (toDate) dateWhere.lt = addPeriod(toDate, "DAILY");

  const where: Prisma.PaymentWhereInput = {
    ...(method ? { method: method as PaymentMethod } : {}),
    ...(fromDate || toDate ? { paymentDate: dateWhere } : {}),
  };
  const filtered = Boolean(method || from || to);

  const [settings, summary, outstanding] = await Promise.all([
    db.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } }),
    db.payment.aggregate({ where, _sum: { amount: true }, _count: true }),
    db.invoice.aggregate({ where: { status: "CONFIRMED" }, _sum: { total: true, amountPaid: true }, _count: true }),
  ]);

  const currency = settings?.currency ?? "INR";
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, currency);
  const total = summary._count;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const payments = await db.payment.findMany({
    where,
    orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true,
      method: true,
      amount: true,
      paymentDate: true,
      note: true,
      recordedBy: { select: { name: true } },
      invoice: { select: { id: true, number: true, customer: { select: { name: true, company: true } } } },
    },
  });

  const href = (nextPage: number) => {
    const sp = new URLSearchParams();
    if (method) sp.set("method", method);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (nextPage > 1) sp.set("page", String(nextPage));
    const qs = sp.toString();
    return qs ? `/dashboard/payments?${qs}` : "/dashboard/payments";
  };

  const rangeLabel =
    from && to ? `${formatDate(fromDate)} – ${formatDate(toDate)}` : from ? `Since ${formatDate(fromDate)}` : to ? `Up to ${formatDate(toDate)}` : "All time";

  return (
    <>
      <PageHeader title="Payments" description="Every payment received, by method and date, against the invoice it settles." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="Total received"
          value={toNumber(summary._sum.amount)}
          prefix={currencySymbol(currency)}
          decimals={2}
          hint={`${total} payment${total === 1 ? "" : "s"}${filtered ? " matching these filters" : ""}`}
        />
        <StatCard label="Payments" value={total} hint={`${method ? PAYMENT_METHOD_LABELS[method] : "All methods"} · ${rangeLabel}`} />
        <StatCard
          label="Still outstanding"
          value={round2(toNumber(outstanding._sum.total) - toNumber(outstanding._sum.amountPaid))}
          prefix={currencySymbol(currency)}
          decimals={2}
          hint={
            <Link
              href="/dashboard/invoices?status=confirmed"
              className="underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
            >
              {outstanding._count} confirmed invoice{outstanding._count === 1 ? "" : "s"} awaiting payment
            </Link>
          }
        />
      </div>

      <Form action="/dashboard/payments" className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Field label="Method">
            <Select name="method" defaultValue={method ?? ""}>
              <option value="">All methods</option>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="w-40">
          <Field label="From">
            <Input name="from" type="date" defaultValue={from} />
          </Field>
        </div>
        <div className="w-40">
          <Field label="To">
            <Input name="to" type="date" defaultValue={to} />
          </Field>
        </div>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
        {filtered && (
          <ButtonLink href="/dashboard/payments" variant="ghost">
            Clear
          </ButtonLink>
        )}
      </Form>

      {payments.length === 0 ? (
        <EmptyState
          message={filtered ? "No payments match these filters." : "No payments yet. Record one from a confirmed invoice."}
        />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Invoice</Th>
                <Th>Customer</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th>Note</Th>
                <Th>Recorded by</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-muted/40">
                  <Td className="tabular-nums">{formatDate(payment.paymentDate)}</Td>
                  <Td>
                    <Link
                      href={`/dashboard/invoices/${payment.invoice.id}`}
                      className="font-medium text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
                    >
                      {payment.invoice.number}
                    </Link>
                  </Td>
                  <Td>
                    <div className="font-medium">{payment.invoice.customer.name}</div>
                    {payment.invoice.customer.company && (
                      <div className="text-xs text-muted-foreground">{payment.invoice.customer.company}</div>
                    )}
                  </Td>
                  <Td>{PAYMENT_METHOD_LABELS[payment.method]}</Td>
                  <Td className="text-right font-medium tabular-nums">{money(payment.amount)}</Td>
                  <Td className="max-w-64 whitespace-normal break-words text-muted-foreground">{payment.note || "—"}</Td>
                  <Td className="text-muted-foreground">
                    {payment.recordedBy?.name ?? (payment.method === "DEMO_PAY" ? "Customer" : "—")}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + payments.length} of {total}
            </p>
            {pageCount > 1 && (
              <div className="flex items-center gap-2">
                {page > 1 ? (
                  <ButtonLink href={href(page - 1)} variant="secondary">
                    Previous
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Previous
                  </Button>
                )}
                <span>
                  Page {page} of {pageCount}
                </span>
                {page < pageCount ? (
                  <ButtonLink href={href(page + 1)} variant="secondary">
                    Next
                  </ButtonLink>
                ) : (
                  <Button variant="secondary" disabled>
                    Next
                  </Button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
