import type { BillingRunTrigger } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { db } from "@/lib/db";
import { storedErrors } from "@/lib/jobs/billing-job";
import { billingSchedulerEnabled } from "@/lib/jobs/scheduler";
import { BUSINESS_TIME_ZONE } from "@/lib/jobs/schedule";
import { Badge, Button, ButtonLink, EmptyState, PageHeader, Table, Td, Th } from "@/components/kit";
import { StatCard } from "@/components/motion";

const PAGE_SIZE = 25;
const SUMMARY_DAYS = 30;
/** A run with no finish time older than this did not finish (server stopped mid-run). */
const STALE_RUN_MS = 2 * 60 * 60 * 1000;

const TRIGGER: Record<BillingRunTrigger, { label: string; tone: "gray" | "blue" }> = {
  MANUAL: { label: "Manual", tone: "gray" },
  SCHEDULED: { label: "Scheduled", tone: "blue" },
};

const dateTime = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: BUSINESS_TIME_ZONE,
});

function first(value: string | string[] | undefined) {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds % 60)} s`;
}

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export default async function BillingRunsPage({ searchParams }: PageProps<"/dashboard/billing-runs">) {
  await requireTeam();

  const params = await searchParams;
  const requestedPage = Math.max(1, Number.parseInt(first(params.page), 10) || 1);

  const now = new Date();
  const since = new Date(now.getTime() - SUMMARY_DAYS * 24 * 60 * 60 * 1000);

  const [total, recent, recentByTrigger, lastScheduled] = await Promise.all([
    db.billingRun.count(),
    db.billingRun.aggregate({
      where: { startedAt: { gte: since } },
      _count: true,
      _sum: { activated: true, invoicesCreated: true, skippedDuplicates: true, closed: true, errorCount: true },
    }),
    db.billingRun.groupBy({ by: ["trigger"], where: { startedAt: { gte: since } }, _count: { _all: true } }),
    db.billingRun.findFirst({ where: { trigger: "SCHEDULED" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, pageCount);

  const runs = await db.billingRun.findMany({
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { triggeredBy: { select: { name: true } } },
  });

  const countFor = (trigger: BillingRunTrigger) =>
    recentByTrigger.find((row) => row.trigger === trigger)?._count._all ?? 0;
  const sums = recent._sum;
  const recentErrors = sums.errorCount ?? 0;
  const schedulerOn = billingSchedulerEnabled();

  const href = (p: number) => (p > 1 ? `/dashboard/billing-runs?page=${p}` : "/dashboard/billing-runs");

  return (
    <>
      <PageHeader
        title="Billing runs"
        description="Every billing run, from the Run billing now button and the automatic daily run after 00:05 (India time)."
      />

      <div className="mb-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={`Runs, last ${SUMMARY_DAYS} days`}
          value={recent._count}
          hint={`${countFor("SCHEDULED")} scheduled · ${countFor("MANUAL")} manual`}
        />
        <StatCard
          label="Invoices created"
          value={sums.invoicesCreated ?? 0}
          hint={`${plural(sums.activated ?? 0, "subscription")} activated · ${sums.closed ?? 0} auto-closed`}
        />
        <StatCard label="Already billed" value={sums.skippedDuplicates ?? 0} hint="Periods skipped, never billed twice" />
        <StatCard
          label="Errors"
          value={recentErrors}
          hint={
            <span className={recentErrors > 0 ? "text-destructive" : undefined}>
              {recentErrors > 0 ? "Check the runs below" : "No failed subscriptions"}
            </span>
          }
        />
      </div>
      <p className="mb-6 text-xs text-muted-foreground">
        Daily scheduler is {schedulerOn ? "on" : "off (BILLING_SCHEDULER=off)"} · last scheduled run{" "}
        {lastScheduled ? dateTime.format(lastScheduled.startedAt) : "not yet"}
      </p>

      {runs.length === 0 ? (
        <EmptyState message="No billing runs yet. Use Run billing now on the Invoices page, or wait for the daily run." />
      ) : (
        <>
          <Table>
            <thead>
              <tr>
                <Th>Started</Th>
                <Th>Trigger</Th>
                <Th>Duration</Th>
                <Th className="text-right">Activated</Th>
                <Th className="text-right">Invoices created</Th>
                <Th className="text-right">Already billed</Th>
                <Th className="text-right">Closed</Th>
                <Th>Errors</Th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const trigger = TRIGGER[run.trigger];
                const errors = storedErrors(run.errors);
                const stale = !run.finishedAt && now.getTime() - run.startedAt.getTime() > STALE_RUN_MS;
                return (
                  <tr key={run.id} className="align-top transition-colors hover:bg-muted/40">
                    <Td className="tabular-nums">{dateTime.format(run.startedAt)}</Td>
                    <Td>
                      <Badge tone={trigger.tone}>{trigger.label}</Badge>
                      {run.trigger === "MANUAL" && run.triggeredBy && (
                        <div className="mt-1 text-xs text-muted-foreground">by {run.triggeredBy.name}</div>
                      )}
                    </Td>
                    <Td className="tabular-nums">
                      {run.finishedAt ? (
                        formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())
                      ) : (
                        <span className="text-muted-foreground">{stale ? "Did not finish" : "Running…"}</span>
                      )}
                    </Td>
                    <Td className="text-right tabular-nums">{run.activated}</Td>
                    <Td className="text-right tabular-nums">{run.invoicesCreated}</Td>
                    <Td className="text-right tabular-nums text-muted-foreground">{run.skippedDuplicates}</Td>
                    <Td className="text-right tabular-nums">{run.closed}</Td>
                    <Td className="max-w-sm">
                      {run.errorCount === 0 ? (
                        <span className="tabular-nums text-muted-foreground">0</span>
                      ) : (
                        <details className="text-destructive">
                          <summary className="cursor-pointer font-medium tabular-nums marker:text-destructive/60">
                            {plural(run.errorCount, "error")}
                          </summary>
                          <ul className="mt-2 space-y-1 text-xs">
                            {errors.map((error, i) => (
                              <li key={i} className="break-words">
                                <span className="font-medium">{error.subscriptionNumber}</span>: {error.message}
                              </li>
                            ))}
                            {run.errorCount > errors.length && (
                              <li className="text-muted-foreground">…and {run.errorCount - errors.length} more</li>
                            )}
                          </ul>
                        </details>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>

          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <p>
              Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + runs.length} of {total}
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
