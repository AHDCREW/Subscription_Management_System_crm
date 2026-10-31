import type { ReactNode } from "react";
import { Button as UIButton } from "@/components/ui/button";
import { Button, ButtonLink, DetailItem } from "@/components/kit";
import { REPORT_PAGE_SIZE } from "@/lib/reports/filters";

// Small building blocks shared by the report tabs.

export const linkClass = "underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground";

/** Count and totals for the filtered set. */
export function SummaryStrip({ items }: { items: { label: string; value: ReactNode; tone?: "danger" }[] }) {
  return (
    <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-4 rounded-lg border bg-card px-5 py-4 sm:grid-cols-4 animate-in fade-in duration-500">
      {items.map((item) => (
        <DetailItem key={item.label} label={item.label}>
          <span className={`text-lg font-semibold tabular-nums ${item.tone === "danger" ? "text-destructive" : ""}`}>
            {item.value}
          </span>
        </DetailItem>
      ))}
    </dl>
  );
}

/** A plain download link styled as a secondary button (not a client-side navigation). */
export function ExportButton({ href }: { href: string }) {
  return (
    <UIButton asChild variant="outline" size="lg" className="px-3.5">
      <a href={href} download>
        Export CSV
      </a>
    </UIButton>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  shown,
  href,
}: {
  page: number;
  pageCount: number;
  total: number;
  shown: number;
  href: (page: number) => string;
}) {
  const start = (page - 1) * REPORT_PAGE_SIZE + 1;
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <p className="tabular-nums">
        Showing {start}–{start + shown - 1} of {total}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <ButtonLink href={href(page - 1)} variant="secondary" scroll={false}>
              Previous
            </ButtonLink>
          ) : (
            <Button variant="secondary" disabled>
              Previous
            </Button>
          )}
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          {page < pageCount ? (
            <ButtonLink href={href(page + 1)} variant="secondary" scroll={false}>
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
  );
}
