import Link from "next/link";
import { requireTeam } from "@/lib/auth";
import { REPORT_TABS, exportHref, pageParamReader, parseReportFilters, reportHref, reportQuery } from "@/lib/reports/filters";
import { getCurrency, getPlanOptions, reportToday, resolveFilters } from "@/lib/reports/queries";
import { PageHeader, cx } from "@/components/kit";
import { FilterBar } from "./filter-bar";
import { ExportButton } from "./report-ui";
import { InvoicesTab, OverdueTab, PaymentsTab, SubscriptionsTab } from "./tabs";

export default async function ReportsPage({ searchParams }: PageProps<"/dashboard/reports">) {
  await requireTeam();

  const filters = parseReportFilters(pageParamReader(await searchParams));
  const today = reportToday();
  const [resolved, plans, currency] = await Promise.all([resolveFilters(filters), getPlanOptions(), getCurrency()]);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Subscriptions, invoices, payments and overdue invoices, filtered and exportable."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Report"
          className="inline-flex flex-wrap items-center gap-0.5 rounded-xl bg-muted p-1 text-sm animate-in fade-in duration-500"
        >
          {REPORT_TABS.map((tab) => {
            const active = tab.value === filters.tab;
            return (
              <Link
                key={tab.value}
                href={reportHref(filters, { tab: tab.value })}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-8 items-center rounded-lg px-3.5 font-medium text-foreground/60 transition-all hover:text-foreground",
                  active && "bg-card text-foreground shadow-xs ring-1 ring-border/60",
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <ExportButton href={exportHref(filters)} />
      </div>

      <FilterBar key={reportQuery(filters, { page: 1 })} filters={filters} plans={plans} />

      {filters.tab === "subscriptions" && <SubscriptionsTab filters={resolved} currency={currency} />}
      {filters.tab === "invoices" && <InvoicesTab filters={resolved} currency={currency} today={today} />}
      {filters.tab === "payments" && <PaymentsTab filters={resolved} currency={currency} />}
      {filters.tab === "overdue" && <OverdueTab filters={resolved} currency={currency} today={today} />}
    </>
  );
}
