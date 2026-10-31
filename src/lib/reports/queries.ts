import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { PENDING_CUSTOMERS } from "@/lib/account-approval";
import { OPEN_REQUEST } from "@/lib/subscriptions/quote-requests";
import { round2, toNumber } from "@/lib/money";
import { addPeriod, monthlyRecurringValue, outstandingAmount, toUtcDate } from "@/lib/billing";
import { subscriptionNumber } from "@/lib/subscriptions/subscriptions";
import {
  REPORT_PAGE_SIZE,
  invoiceStatusFilter,
  paymentMethodFilter,
  subscriptionStatusFilter,
  type ReportFilters,
} from "./filters";
import { monthKey, monthStart } from "./format";

// Database side of the dashboard and reports. Every figure is computed in SQL
// (count / aggregate / groupBy / one raw query for MRR and month buckets) and
// every list is paginated, so pages stay fast with thousands of rows.

/** Customers matched by a name/email/company search before filtering by customerId (indexed). */
const MAX_CUSTOMER_MATCHES = 500;

/** Today as a calendar date (midnight UTC), the same rule the invoice pages use for "overdue". */
export function reportToday(now = new Date()): Date {
  return toUtcDate(now);
}

/** Overdue = confirmed, not fully paid, due before today. */
export function overdueWhere(today: Date): Prisma.InvoiceWhereInput {
  return { status: "CONFIRMED", dueDate: { lt: today }, amountPaid: { lt: db.invoice.fields.total } };
}

export async function getCurrency(): Promise<string> {
  const settings = await db.companySettings.findUnique({ where: { id: 1 }, select: { currency: true } });
  return settings?.currency ?? "INR";
}

// ─── Filters → WHERE ──────────────────────────────────────────────────────────

/** Filters with the customer search resolved to ids (null when there is no search). */
export type ResolvedFilters = ReportFilters & { customerIds: number[] | null };

export async function resolveFilters(filters: ReportFilters): Promise<ResolvedFilters> {
  if (!filters.q) return { ...filters, customerIds: null };
  const customers = await db.user.findMany({
    where: {
      role: "CUSTOMER",
      OR: [{ name: { contains: filters.q } }, { email: { contains: filters.q } }, { company: { contains: filters.q } }],
    },
    select: { id: true },
    take: MAX_CUSTOMER_MATCHES,
  });
  return { ...filters, customerIds: customers.map((c) => c.id) };
}

/** [from, to] inclusive as a Prisma range: gte from, lt the day after `to`. */
function dateRange(filters: ReportFilters): Prisma.DateTimeFilter | undefined {
  if (!filters.from && !filters.to) return undefined;
  return {
    ...(filters.from && { gte: filters.from }),
    ...(filters.to && { lt: addPeriod(filters.to, "DAILY") }),
  };
}

/** A search can also be an exact document number: "INV-00042", "sub-12", "12". */
function numberFromSearch(q: string, prefix: "SUB" | "INV"): string {
  if (prefix === "SUB") {
    const match = /^(?:sub-?)?(\d{1,9})$/i.exec(q);
    if (match) return subscriptionNumber(Number(match[1]));
  }
  return q.toUpperCase();
}

function customerOr<T>(filters: ResolvedFilters, byCustomer: (ids: number[]) => T, byNumber: T): T[] {
  return filters.customerIds?.length ? [byCustomer(filters.customerIds), byNumber] : [byNumber];
}

export function subscriptionWhere(filters: ResolvedFilters): Prisma.SubscriptionWhereInput {
  const status = subscriptionStatusFilter(filters);
  const and: Prisma.SubscriptionWhereInput[] = [];
  if (status) and.push({ status });
  if (filters.planId) and.push({ planId: filters.planId });
  const range = dateRange(filters);
  if (range) and.push({ startDate: range });
  if (filters.q) {
    and.push({
      OR: customerOr<Prisma.SubscriptionWhereInput>(
        filters,
        (ids) => ({ customerId: { in: ids } }),
        { number: numberFromSearch(filters.q, "SUB") },
      ),
    });
  }
  return { AND: and };
}

function invoiceSearch(filters: ResolvedFilters): Prisma.InvoiceWhereInput[] {
  if (!filters.q) return [];
  return [
    {
      OR: customerOr<Prisma.InvoiceWhereInput>(
        filters,
        (ids) => ({ customerId: { in: ids } }),
        { number: numberFromSearch(filters.q, "INV") },
      ),
    },
  ];
}

export function invoiceWhere(filters: ResolvedFilters, today: Date): Prisma.InvoiceWhereInput {
  const status = invoiceStatusFilter(filters);
  const and: Prisma.InvoiceWhereInput[] = [];
  if (status === "OVERDUE") and.push(overdueWhere(today));
  else if (status) and.push({ status });
  if (filters.planId) and.push({ subscription: { planId: filters.planId } });
  const range = dateRange(filters);
  if (range) and.push({ invoiceDate: range });
  and.push(...invoiceSearch(filters));
  return { AND: and };
}

export function overdueReportWhere(filters: ResolvedFilters, today: Date): Prisma.InvoiceWhereInput {
  const and: Prisma.InvoiceWhereInput[] = [overdueWhere(today)];
  if (filters.planId) and.push({ subscription: { planId: filters.planId } });
  const range = dateRange(filters);
  if (range) and.push({ dueDate: range });
  and.push(...invoiceSearch(filters));
  return { AND: and };
}

export function paymentWhere(filters: ResolvedFilters): Prisma.PaymentWhereInput {
  const method = paymentMethodFilter(filters);
  const and: Prisma.PaymentWhereInput[] = [];
  if (method) and.push({ method });
  const range = dateRange(filters);
  if (range) and.push({ paymentDate: range });
  if (filters.planId) and.push({ invoice: { subscription: { planId: filters.planId } } });
  if (filters.q) {
    and.push({
      OR: customerOr<Prisma.PaymentWhereInput>(
        filters,
        (ids) => ({ invoice: { customerId: { in: ids } } }),
        { invoice: { number: numberFromSearch(filters.q, "INV") } },
      ),
    });
  }
  return { AND: and };
}

/** The same subscription filters as raw SQL (alias `s`), for the MRR sum. */
function subscriptionSqlWhere(filters: ResolvedFilters): Prisma.Sql {
  const conds: Prisma.Sql[] = [Prisma.sql`1 = 1`];
  const status = subscriptionStatusFilter(filters);
  if (status) conds.push(Prisma.sql`s.status = ${status}`);
  if (filters.planId) conds.push(Prisma.sql`s.planId = ${filters.planId}`);
  if (filters.from) conds.push(Prisma.sql`s.startDate >= ${filters.from}`);
  if (filters.to) conds.push(Prisma.sql`s.startDate < ${addPeriod(filters.to, "DAILY")}`);
  if (filters.q) {
    const number = numberFromSearch(filters.q, "SUB");
    conds.push(
      filters.customerIds?.length
        ? Prisma.sql`(s.customerId IN (${Prisma.join(filters.customerIds)}) OR s.number = ${number})`
        : Prisma.sql`s.number = ${number}`,
    );
  }
  return Prisma.join(conds, " AND ");
}

// ─── Recurring value (MRR) ────────────────────────────────────────────────────

/**
 * Recurring amount per period = plan price + Σ(quantity × unit price) of the
 * lines, tax exclusive and before discounts. Multiplied by periods per year and
 * divided by 12 once at the end, so yearly plans don't lose precision.
 */
const ANNUALISED_VALUE = Prisma.sql`
  (p.price + COALESCE((SELECT SUM(l.quantity * l.unitPrice) FROM SubscriptionLine l WHERE l.subscriptionId = s.id), 0))
  * CASE p.billingPeriod WHEN 'DAILY' THEN 365 WHEN 'WEEKLY' THEN 52 WHEN 'YEARLY' THEN 1 ELSE 12 END`;

type RecurringRow = { count: bigint; active: Prisma.Decimal | null; annual: Prisma.Decimal | null; activeAnnual: Prisma.Decimal | null };

async function recurringSummary(where: Prisma.Sql) {
  const [row] = await db.$queryRaw<RecurringRow[]>`
    SELECT COUNT(*) AS count,
           SUM(t.status = 'ACTIVE') AS active,
           SUM(t.annual) AS annual,
           SUM(CASE WHEN t.status = 'ACTIVE' THEN t.annual END) AS activeAnnual
    FROM (
      SELECT s.status, ${ANNUALISED_VALUE} AS annual
      FROM Subscription s
      JOIN Plan p ON p.id = s.planId
      WHERE ${where}
    ) t`;
  return {
    count: Number(row?.count ?? 0),
    active: toNumber(row?.active),
    monthlyValue: round2(toNumber(row?.annual) / 12),
    mrr: round2(toNumber(row?.activeAnnual) / 12),
  };
}

/** Monthly value of one subscription row (same rule as the SQL above). */
export function rowMonthlyValue(sub: {
  plan: { price: Prisma.Decimal; billingPeriod: Parameters<typeof monthlyRecurringValue>[1] };
  lines: { quantity: number; unitPrice: Prisma.Decimal }[];
}): number {
  const perPeriod = toNumber(sub.plan.price) + sub.lines.reduce((sum, l) => sum + l.quantity * toNumber(l.unitPrice), 0);
  return round2(monthlyRecurringValue(perPeriod, sub.plan.billingPeriod));
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export type RevenueMonth = { key: string; start: Date; amount: number; count: number };

/** Payments received per calendar month (UTC) for the last `months` months, oldest first. */
async function revenueByMonth(today: Date, months: number): Promise<RevenueMonth[]> {
  const start = monthStart(today, -(months - 1));
  const end = monthStart(today, 1);
  const rows = await db.$queryRaw<{ ym: string; total: Prisma.Decimal | null; count: bigint }[]>`
    SELECT DATE_FORMAT(paymentDate, '%Y-%m') AS ym, SUM(amount) AS total, COUNT(*) AS count
    FROM Payment
    WHERE paymentDate >= ${start} AND paymentDate < ${end}
    GROUP BY ym`;
  const byKey = new Map(rows.map((row) => [row.ym, row]));
  return Array.from({ length: months }, (_, i) => {
    const monthDate = monthStart(today, i - (months - 1));
    const row = byKey.get(monthKey(monthDate));
    return { key: monthKey(monthDate), start: monthDate, amount: round2(toNumber(row?.total)), count: Number(row?.count ?? 0) };
  });
}

export async function getDashboardData(now = new Date()) {
  const today = reportToday(now);
  const thisMonth = monthStart(today);
  const overdue = overdueWhere(today);

  const [currency, recurring, revenue, outstanding, overdueTotals, revenueMonths, topOverdue, recentPayments, byStatus] =
    await Promise.all([
      getCurrency(),
      recurringSummary(Prisma.sql`s.status = 'ACTIVE'`),
      db.payment.aggregate({ where: { paymentDate: { gte: thisMonth } }, _sum: { amount: true }, _count: true }),
      db.invoice.aggregate({ where: { status: "CONFIRMED" }, _sum: { total: true, amountPaid: true }, _count: true }),
      db.invoice.aggregate({ where: overdue, _sum: { total: true, amountPaid: true }, _count: true }),
      revenueByMonth(today, 6),
      db.invoice.findMany({
        where: overdue,
        orderBy: [{ dueDate: "asc" }, { id: "asc" }],
        take: 5,
        select: {
          id: true,
          number: true,
          dueDate: true,
          total: true,
          amountPaid: true,
          customer: { select: { name: true, company: true } },
        },
      }),
      db.payment.findMany({
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          paymentDate: true,
          method: true,
          amount: true,
          invoice: { select: { id: true, number: true, customer: { select: { name: true } } } },
        },
      }),
      db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);

  return {
    today,
    currency,
    activeSubscriptions: recurring.count,
    mrr: recurring.mrr,
    revenueThisMonth: { amount: toNumber(revenue._sum.amount), count: revenue._count },
    outstanding: {
      amount: round2(toNumber(outstanding._sum.total) - toNumber(outstanding._sum.amountPaid)),
      count: outstanding._count,
    },
    overdue: {
      amount: round2(toNumber(overdueTotals._sum.total) - toNumber(overdueTotals._sum.amountPaid)),
      count: overdueTotals._count,
    },
    revenueMonths,
    topOverdue,
    recentPayments,
    subscriptionsByStatus: new Map(byStatus.map((row) => [row.status, row._count._all])),
  };
}

// ─── Role homes ───────────────────────────────────────────────────────────────

/** Rows shown per work-queue card; the card links to the full filtered list. */
const QUEUE_SIZE = 5;
const EXPIRING_WITHIN_DAYS = 14;

/** Counts behind the admin's setup strip. */
export async function getSetupCounts() {
  const [products, plans, taxes, discounts, staff, pendingCustomers] = await Promise.all([
    db.product.count({ where: { active: true } }),
    db.plan.count({ where: { active: true } }),
    db.tax.count({ where: { active: true } }),
    db.discount.count({ where: { active: true } }),
    db.user.count({ where: { role: "STAFF" } }),
    db.user.count({ where: PENDING_CUSTOMERS }),
  ]);
  return { products, plans, taxes, discounts, staff, pendingCustomers };
}

/**
 * The staff work queue: for each kind of task, how many are waiting and the
 * first few, oldest or most urgent first. Every filter hits an index (status,
 * role, dueDate, paymentDate), so this stays cheap with thousands of rows.
 */
export async function getStaffQueue(now = new Date()) {
  const today = reportToday(now);
  const tomorrow = addPeriod(today, "DAILY");
  const overdue = overdueWhere(today);
  const expiring: Prisma.SubscriptionWhereInput = {
    status: { in: ["ACTIVE", "PAUSED"] },
    expiryDate: { gte: today, lte: addPeriod(today, "DAILY", EXPIRING_WITHIN_DAYS) },
  };
  const paidToday: Prisma.PaymentWhereInput = { paymentDate: { gte: today, lt: tomorrow } };
  const customer = { select: { name: true, company: true } } as const;

  const [
    currency,
    pendingCount,
    pending,
    quoteRequestCount,
    quoteRequests,
    quotationCount,
    quotations,
    draftCount,
    drafts,
    overdueCount,
    overdueRows,
    expiringCount,
    expiringRows,
    paymentCount,
    payments,
  ] = await Promise.all([
    getCurrency(),
    db.user.count({ where: PENDING_CUSTOMERS }),
    db.user.findMany({
      where: PENDING_CUSTOMERS,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, name: true, email: true, company: true, createdAt: true },
    }),
    db.subscription.count({ where: OPEN_REQUEST }),
    db.subscription.findMany({
      where: OPEN_REQUEST,
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, number: true, requestedAt: true, customer, plan: { select: { name: true } } },
    }),
    db.subscription.count({ where: { status: "QUOTATION" } }),
    db.subscription.findMany({
      where: { status: "QUOTATION" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, number: true, quotationExpiresAt: true, customer, plan: { select: { name: true } } },
    }),
    db.invoice.count({ where: { status: "DRAFT" } }),
    db.invoice.findMany({
      where: { status: "DRAFT" },
      orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, number: true, invoiceDate: true, total: true, customer },
    }),
    db.invoice.count({ where: overdue }),
    db.invoice.findMany({
      where: overdue,
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, number: true, dueDate: true, total: true, amountPaid: true, customer },
    }),
    db.subscription.count({ where: expiring }),
    db.subscription.findMany({
      where: expiring,
      orderBy: [{ expiryDate: "asc" }, { id: "asc" }],
      take: QUEUE_SIZE,
      select: { id: true, number: true, expiryDate: true, customer, plan: { select: { name: true } } },
    }),
    db.payment.count({ where: paidToday }),
    db.payment.findMany({
      where: paidToday,
      orderBy: { id: "desc" },
      take: QUEUE_SIZE,
      select: {
        id: true,
        method: true,
        amount: true,
        invoice: { select: { id: true, number: true, customer: { select: { name: true } } } },
      },
    }),
  ]);

  return {
    today,
    currency,
    pendingCustomers: { count: pendingCount, rows: pending },
    quoteRequests: { count: quoteRequestCount, rows: quoteRequests },
    quotations: { count: quotationCount, rows: quotations },
    draftInvoices: { count: draftCount, rows: drafts },
    overdueInvoices: { count: overdueCount, rows: overdueRows },
    expiring: { count: expiringCount, rows: expiringRows },
    paymentsToday: { count: paymentCount, rows: payments },
  };
}

// ─── Reports: selects and ordering shared by the page and the CSV export ─────

export const subscriptionReportSelect = {
  id: true,
  number: true,
  status: true,
  startDate: true,
  expiryDate: true,
  nextInvoiceDate: true,
  customer: { select: { name: true, email: true } },
  plan: { select: { name: true, price: true, billingPeriod: true } },
  lines: { select: { quantity: true, unitPrice: true } },
} satisfies Prisma.SubscriptionSelect;

export const subscriptionReportOrder: Prisma.SubscriptionOrderByWithRelationInput[] = [{ id: "desc" }];

export const invoiceReportSelect = {
  id: true,
  number: true,
  status: true,
  invoiceDate: true,
  dueDate: true,
  total: true,
  amountPaid: true,
  customer: { select: { name: true, email: true } },
  subscription: { select: { number: true, plan: { select: { name: true } } } },
} satisfies Prisma.InvoiceSelect;

export const invoiceReportOrder: Prisma.InvoiceOrderByWithRelationInput[] = [{ invoiceDate: "desc" }, { id: "desc" }];
export const overdueReportOrder: Prisma.InvoiceOrderByWithRelationInput[] = [{ dueDate: "asc" }, { id: "asc" }];

export const paymentReportSelect = {
  id: true,
  paymentDate: true,
  method: true,
  amount: true,
  note: true,
  reference: true,
  invoice: { select: { id: true, number: true, customer: { select: { name: true, email: true } } } },
} satisfies Prisma.PaymentSelect;

export const paymentReportOrder: Prisma.PaymentOrderByWithRelationInput[] = [{ paymentDate: "desc" }, { id: "desc" }];

/** Clamp a requested page to the last page and return skip/take. */
export function pageWindow(requested: number, total: number) {
  const pageCount = Math.max(1, Math.ceil(total / REPORT_PAGE_SIZE));
  const page = Math.min(requested, pageCount);
  return { page, pageCount, total, skip: (page - 1) * REPORT_PAGE_SIZE, take: REPORT_PAGE_SIZE };
}

// ─── Reports: one function per tab (summary + one page of rows) ──────────────

export async function subscriptionsReport(filters: ResolvedFilters) {
  const where = subscriptionWhere(filters);
  const summary = await recurringSummary(subscriptionSqlWhere(filters));
  const window = pageWindow(filters.page, summary.count);
  const rows = await db.subscription.findMany({
    where,
    orderBy: subscriptionReportOrder,
    skip: window.skip,
    take: window.take,
    select: subscriptionReportSelect,
  });
  return { summary, window, rows };
}

export async function invoicesReport(filters: ResolvedFilters, today: Date) {
  const where = invoiceWhere(filters, today);
  const [byStatus, overdueCount] = await Promise.all([
    db.invoice.groupBy({ by: ["status"], where, _count: { _all: true }, _sum: { total: true, amountPaid: true } }),
    db.invoice.count({ where: { AND: [where, overdueWhere(today)] } }),
  ]);
  const sum = (statuses: string[], pick: (row: (typeof byStatus)[number]) => number) =>
    round2(byStatus.filter((row) => statuses.includes(row.status)).reduce((acc, row) => acc + pick(row), 0));
  const count = byStatus.reduce((acc, row) => acc + row._count._all, 0);
  const summary = {
    count,
    // Billed = confirmed or paid (drafts aren't sent, cancelled ones don't count).
    billed: sum(["CONFIRMED", "PAID"], (row) => toNumber(row._sum.total)),
    paid: sum(["CONFIRMED", "PAID"], (row) => toNumber(row._sum.amountPaid)),
    balance: sum(["CONFIRMED"], (row) => toNumber(row._sum.total) - toNumber(row._sum.amountPaid)),
    overdueCount,
  };
  const window = pageWindow(filters.page, count);
  const rows = await db.invoice.findMany({
    where,
    orderBy: invoiceReportOrder,
    skip: window.skip,
    take: window.take,
    select: invoiceReportSelect,
  });
  return { summary, window, rows };
}

export async function paymentsReport(filters: ResolvedFilters) {
  const where = paymentWhere(filters);
  const totals = await db.payment.aggregate({ where, _sum: { amount: true }, _count: true });
  const summary = { count: totals._count, amount: toNumber(totals._sum.amount) };
  const window = pageWindow(filters.page, summary.count);
  const rows = await db.payment.findMany({
    where,
    orderBy: paymentReportOrder,
    skip: window.skip,
    take: window.take,
    select: paymentReportSelect,
  });
  return { summary, window, rows };
}

export async function overdueReport(filters: ResolvedFilters, today: Date) {
  const where = overdueReportWhere(filters, today);
  const totals = await db.invoice.aggregate({
    where,
    _sum: { total: true, amountPaid: true },
    _count: true,
    _min: { dueDate: true },
  });
  const summary = {
    count: totals._count,
    balance: round2(toNumber(totals._sum.total) - toNumber(totals._sum.amountPaid)),
    oldestDueDate: totals._min.dueDate,
  };
  const window = pageWindow(filters.page, summary.count);
  const rows = await db.invoice.findMany({
    where,
    orderBy: overdueReportOrder,
    skip: window.skip,
    take: window.take,
    select: invoiceReportSelect,
  });
  return { summary, window, rows };
}

/** Balance shown for an invoice: what's still owed on a confirmed one, 0 when paid, null otherwise. */
export function invoiceBalance(invoice: { status: string; total: Prisma.Decimal; amountPaid: Prisma.Decimal }): number | null {
  if (invoice.status === "CONFIRMED") return outstandingAmount(invoice.total, invoice.amountPaid);
  if (invoice.status === "PAID") return 0;
  return null;
}

export async function getPlanOptions() {
  return db.plan.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, active: true } });
}
