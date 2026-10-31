import type { InvoiceStatus, PaymentMethod, SubscriptionStatus } from "@prisma/client";
import { isSubscriptionStatus, parseDateInput, toDateInput } from "@/lib/subscriptions/subscriptions";
import { PAYMENT_METHODS } from "./format";

// Report filters live in the URL (?tab=&from=&to=&status=&q=&plan=&page=), so the
// page, its pagination links and the CSV export all read the same values.
// Pure parsing only; see queries.ts for the database side.

export const REPORT_TABS = [
  { value: "subscriptions", label: "Subscriptions" },
  { value: "invoices", label: "Invoices" },
  { value: "payments", label: "Payments" },
  { value: "overdue", label: "Overdue" },
] as const;

export type ReportTab = (typeof REPORT_TABS)[number]["value"];

export const REPORT_PAGE_SIZE = 25;
export const EXPORT_ROW_LIMIT = 50_000;

/** Which date each tab's from/to range applies to. */
export const DATE_FIELD_LABEL: Record<ReportTab, string> = {
  subscriptions: "Start date",
  invoices: "Invoice date",
  payments: "Payment date",
  overdue: "Due date",
};

export type InvoiceStatusFilter = InvoiceStatus | "OVERDUE";

export type ReportFilters = {
  tab: ReportTab;
  /** Inclusive calendar dates (midnight UTC). */
  from: Date | null;
  to: Date | null;
  /** Lowercase value from the URL, already validated for the tab ("" = any). */
  status: string;
  q: string;
  planId: number | null;
  page: number;
};

type ParamReader = (key: string) => string;

/** Read params from a page's `searchParams` object. */
export function pageParamReader(params: Record<string, string | string[] | undefined>): ParamReader {
  return (key) => {
    const value = params[key];
    return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
  };
}

/** Read params from a request URL. */
export function urlParamReader(searchParams: URLSearchParams): ParamReader {
  return (key) => (searchParams.get(key) ?? "").trim();
}

export function isReportTab(value: string): value is ReportTab {
  return REPORT_TABS.some((tab) => tab.value === value);
}

/** Status options shown in the filter bar for a tab ("status" means payment method on Payments). */
export function statusOptions(tab: ReportTab): { value: string; label: string }[] {
  switch (tab) {
    case "subscriptions":
      return [
        { value: "draft", label: "Draft" },
        { value: "quotation", label: "Quotation" },
        { value: "confirmed", label: "Confirmed" },
        { value: "active", label: "Active" },
        { value: "paused", label: "Paused" },
        { value: "closed", label: "Closed" },
      ];
    case "invoices":
      return [
        { value: "draft", label: "Draft" },
        { value: "confirmed", label: "Confirmed" },
        { value: "overdue", label: "Overdue" },
        { value: "paid", label: "Paid" },
        { value: "cancelled", label: "Cancelled" },
      ];
    case "payments":
      return [
        { value: "cash", label: "Cash" },
        { value: "bank_transfer", label: "Bank transfer" },
        { value: "card", label: "Card" },
        { value: "upi", label: "UPI" },
        { value: "cheque", label: "Cheque" },
        { value: "demo_pay", label: "Demo Pay" },
      ];
    case "overdue":
      return [];
  }
}

export function statusFilterLabel(tab: ReportTab): string {
  return tab === "payments" ? "Method" : "Status";
}

export function parseReportFilters(read: ParamReader): ReportFilters {
  const tabParam = read("tab").toLowerCase();
  const tab: ReportTab = isReportTab(tabParam) ? tabParam : "subscriptions";

  let from = parseDateInput(read("from"));
  let to = parseDateInput(read("to"));
  if (from && to && from > to) [from, to] = [to, from];

  const statusParam = read("status").toLowerCase();
  const status = statusOptions(tab).some((option) => option.value === statusParam) ? statusParam : "";

  const planParam = Number.parseInt(read("plan"), 10);
  const planId = Number.isSafeInteger(planParam) && planParam > 0 ? planParam : null;

  const page = Math.max(1, Math.min(100_000, Number.parseInt(read("page"), 10) || 1));

  return { tab, from, to, status, q: read("q").slice(0, 100), planId, page };
}

export function subscriptionStatusFilter(filters: ReportFilters): SubscriptionStatus | null {
  const value = filters.status.toUpperCase();
  return filters.tab === "subscriptions" && isSubscriptionStatus(value) ? value : null;
}

export function invoiceStatusFilter(filters: ReportFilters): InvoiceStatusFilter | null {
  if (filters.tab !== "invoices" || !filters.status) return null;
  return filters.status.toUpperCase() as InvoiceStatusFilter;
}

export function paymentMethodFilter(filters: ReportFilters): PaymentMethod | null {
  const value = filters.status.toUpperCase();
  return filters.tab === "payments" && (PAYMENT_METHODS as string[]).includes(value) ? (value as PaymentMethod) : null;
}

/** Whether any filter (other than the tab and page) is set. */
export function hasFilters(filters: ReportFilters): boolean {
  return Boolean(filters.from || filters.to || filters.status || filters.q || filters.planId);
}

/**
 * Query string for these filters with some overrides. Changing tab drops the
 * status (its options differ per tab); any change other than `page` resets paging.
 */
export function reportQuery(filters: ReportFilters, next: Partial<Pick<ReportFilters, "tab" | "page">> = {}): string {
  const tab = next.tab ?? filters.tab;
  const sp = new URLSearchParams();
  sp.set("tab", tab);
  if (filters.from) sp.set("from", toDateInput(filters.from));
  if (filters.to) sp.set("to", toDateInput(filters.to));
  if (filters.status && tab === filters.tab) sp.set("status", filters.status);
  if (filters.q) sp.set("q", filters.q);
  if (filters.planId) sp.set("plan", String(filters.planId));
  const page = next.page ?? (next.tab ? 1 : filters.page);
  if (page > 1) sp.set("page", String(page));
  return sp.toString();
}

export function reportHref(filters: ReportFilters, next: Partial<Pick<ReportFilters, "tab" | "page">> = {}): string {
  return `/dashboard/reports?${reportQuery(filters, next)}`;
}

/** Export URL for the same filtered rows (no paging). */
export function exportHref(filters: ReportFilters): string {
  return `/dashboard/reports/export?${reportQuery(filters, { page: 1 })}`;
}
