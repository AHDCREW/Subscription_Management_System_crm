import "server-only";
import { db } from "@/lib/db";
import { toNumber } from "@/lib/money";
import { STATUS_INFO } from "@/lib/subscriptions/subscriptions";
import { isInvoiceOverdue } from "@/lib/billing";
import { csvDate, csvMoney, csvRow, type CsvValue } from "./csv";
import { EXPORT_ROW_LIMIT, type ReportTab } from "./filters";
import { PAYMENT_METHOD_LABEL, daysOverdue } from "./format";
import {
  invoiceBalance,
  invoiceReportOrder,
  invoiceReportSelect,
  invoiceWhere,
  overdueReportOrder,
  overdueReportWhere,
  paymentReportOrder,
  paymentReportSelect,
  paymentWhere,
  rowMonthlyValue,
  subscriptionReportOrder,
  subscriptionReportSelect,
  subscriptionWhere,
  type ResolvedFilters,
} from "./queries";

// CSV export of a report tab: the same filters and order as the page, read in
// batches with a cursor (no OFFSET scans) and streamed out row by row.

const BATCH_SIZE = 1000;

const INVOICE_STATUS_LABEL = { DRAFT: "Draft", CONFIRMED: "Confirmed", PAID: "Paid", CANCELLED: "Cancelled" } as const;

type Fetch<T> = (cursor: number | null, take: number) => Promise<T[]>;

async function* inBatches<T extends { id: number }>(fetch: Fetch<T>, limit: number, batchSize = BATCH_SIZE): AsyncGenerator<T> {
  let cursor: number | null = null;
  let sent = 0;
  while (sent < limit) {
    const take = Math.min(batchSize, limit - sent);
    const batch = await fetch(cursor, take);
    for (const row of batch) yield row;
    sent += batch.length;
    if (batch.length < take) return;
    cursor = batch[batch.length - 1].id;
  }
}

const page = (cursor: number | null, take: number) => ({ take, ...(cursor !== null && { cursor: { id: cursor }, skip: 1 }) });

export const EXPORT_HEADERS: Record<ReportTab, string[]> = {
  subscriptions: ["Number", "Customer", "Email", "Plan", "Status", "Start date", "Expiry date", "Next invoice", "Monthly value"],
  invoices: ["Number", "Customer", "Email", "Subscription", "Plan", "Status", "Overdue", "Invoice date", "Due date", "Total", "Paid", "Balance"],
  payments: ["Payment date", "Invoice", "Customer", "Email", "Method", "Amount", "Reference", "Note"],
  overdue: ["Number", "Customer", "Email", "Subscription", "Due date", "Days overdue", "Total", "Paid", "Balance"],
};

/** Rows (as cell arrays) for one tab, capped at `limit`. */
export function exportRows(
  tab: ReportTab,
  filters: ResolvedFilters,
  today: Date,
  limit = EXPORT_ROW_LIMIT,
  batchSize = BATCH_SIZE,
): AsyncGenerator<CsvValue[]> {
  switch (tab) {
    case "subscriptions": {
      const where = subscriptionWhere(filters);
      return map(
        inBatches(
          (cursor, take) =>
            db.subscription.findMany({ where, orderBy: subscriptionReportOrder, select: subscriptionReportSelect, ...page(cursor, take) }),
          limit,
          batchSize,
        ),
        (s) => [
          s.number,
          s.customer.name,
          s.customer.email,
          s.plan.name,
          STATUS_INFO[s.status].label,
          csvDate(s.startDate),
          csvDate(s.expiryDate),
          s.status === "CLOSED" ? "" : csvDate(s.nextInvoiceDate),
          csvMoney(rowMonthlyValue(s)),
        ],
      );
    }
    case "invoices": {
      const where = invoiceWhere(filters, today);
      return map(
        inBatches(
          (cursor, take) => db.invoice.findMany({ where, orderBy: invoiceReportOrder, select: invoiceReportSelect, ...page(cursor, take) }),
          limit,
          batchSize,
        ),
        (i) => {
          const balance = invoiceBalance(i);
          return [
            i.number,
            i.customer.name,
            i.customer.email,
            i.subscription?.number ?? "",
            i.subscription?.plan.name ?? "",
            INVOICE_STATUS_LABEL[i.status],
            isInvoiceOverdue(i, today) ? "Yes" : "No",
            csvDate(i.invoiceDate),
            csvDate(i.dueDate),
            csvMoney(toNumber(i.total)),
            csvMoney(toNumber(i.amountPaid)),
            balance === null ? "" : csvMoney(balance),
          ];
        },
      );
    }
    case "payments": {
      const where = paymentWhere(filters);
      return map(
        inBatches(
          (cursor, take) => db.payment.findMany({ where, orderBy: paymentReportOrder, select: paymentReportSelect, ...page(cursor, take) }),
          limit,
          batchSize,
        ),
        (p) => [
          csvDate(p.paymentDate),
          p.invoice.number,
          p.invoice.customer.name,
          p.invoice.customer.email,
          PAYMENT_METHOD_LABEL[p.method],
          csvMoney(toNumber(p.amount)),
          p.reference ?? "",
          p.note ?? "",
        ],
      );
    }
    case "overdue": {
      const where = overdueReportWhere(filters, today);
      return map(
        inBatches(
          (cursor, take) => db.invoice.findMany({ where, orderBy: overdueReportOrder, select: invoiceReportSelect, ...page(cursor, take) }),
          limit,
          batchSize,
        ),
        (i) => [
          i.number,
          i.customer.name,
          i.customer.email,
          i.subscription?.number ?? "",
          csvDate(i.dueDate),
          daysOverdue(i.dueDate, today),
          csvMoney(toNumber(i.total)),
          csvMoney(toNumber(i.amountPaid)),
          csvMoney(invoiceBalance(i) ?? 0),
        ],
      );
    }
  }
}

async function* map<T, U>(source: AsyncGenerator<T>, fn: (row: T) => U): AsyncGenerator<U> {
  for await (const row of source) yield fn(row);
}

/** A UTF-8 CSV stream (with BOM so Excel reads ₹ and names correctly). */
export function csvStream(header: string[], rows: AsyncGenerator<CsvValue[]>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const LINES_PER_CHUNK = 500;
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`﻿${csvRow(header)}`));
    },
    async pull(controller) {
      try {
        let chunk = "";
        for (let i = 0; i < LINES_PER_CHUNK; i++) {
          const next = await rows.next();
          if (next.done) {
            if (chunk) controller.enqueue(encoder.encode(chunk));
            controller.close();
            return;
          }
          chunk += csvRow(next.value);
        }
        controller.enqueue(encoder.encode(chunk));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await rows.return(undefined);
    },
  });
}
