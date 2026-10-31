"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CalendarClock, CheckCheck, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import type { BillingRunSummary } from "@/lib/billing/run";
import type { LastBillingRun } from "@/lib/jobs/billing-job";
import { Button } from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { confirmAllDrafts, runBillingNow } from "./actions";

function invoices(n: number) {
  return `${n} invoice${n === 1 ? "" : "s"}`;
}

/** Confirms every draft invoice at once, after a confirm dialog showing how many. */
export function ConfirmAllDraftsButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function confirmAll() {
    startTransition(async () => {
      try {
        const { confirmed } = await confirmAllDrafts();
        if (confirmed === 0) toast.info("No draft invoices to confirm");
        else toast.success(`${invoices(confirmed)} confirmed`);
        setOpen(false);
      } catch {
        toast.error("Could not confirm the drafts. Please try again.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={count === 0 || pending}>
        <CheckCheck className="size-4" aria-hidden />
        Confirm all drafts
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm all draft invoices?</DialogTitle>
            <DialogDescription>
              {invoices(count)} will move from Draft to Confirmed and become payable. Drafts created after this page loaded
              are included too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={confirmAll} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending ? "Confirming…" : `Confirm ${invoices(count)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function describe(summary: BillingRunSummary) {
  const parts = [
    `${summary.invoicesCreated} invoice${summary.invoicesCreated === 1 ? "" : "s"} created`,
    `${summary.activated} activated`,
    `${summary.skippedDuplicates} already billed`,
    `${summary.closed} closed`,
  ];
  return parts.join(" · ");
}

/** A just-finished manual run in the shape the "last run" panel shows. */
function toLastRun(summary: BillingRunSummary): LastBillingRun {
  return {
    trigger: "MANUAL",
    today: summary.today,
    finishedAt: summary.finishedAt,
    activated: summary.activated,
    invoicesCreated: summary.invoicesCreated,
    skippedDuplicates: summary.skippedDuplicates,
    closed: summary.closed,
    errorCount: summary.errors.length,
    errors: summary.errors.slice(0, 20).map(({ subscriptionNumber, message }) => ({ subscriptionNumber, message })),
  };
}

export function RunBillingButton({ onDone }: { onDone?: (run: LastBillingRun) => void }) {
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const summary = await runBillingNow();
        if ("inProgress" in summary) {
          toast.info("Billing is already running", { description: summary.message });
          return;
        }
        onDone?.(toLastRun(summary));
        const text = describe(summary);
        if (summary.errors.length > 0) {
          toast.warning(`Billing run finished with ${summary.errors.length} error(s)`, { description: text });
        } else if (summary.invoicesCreated === 0 && summary.activated === 0 && summary.closed === 0) {
          toast.info("Nothing to bill today", { description: "Every due period already has an invoice." });
        } else {
          toast.success("Billing run complete", { description: text });
        }
      } catch {
        toast.error("The billing run failed. Please try again.");
      }
    });
  }

  return (
    <Button type="button" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Play className="size-4" aria-hidden />}
      {pending ? "Running billing…" : "Run billing now"}
    </Button>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: "red" }) {
  return (
    <div className="min-w-24">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone === "red" && value > 0 ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

/** Header action plus the "last run" panel, sharing the latest result. */
export function BillingRunPanel({ initial, draftCount }: { initial: LastBillingRun | null; draftCount: number }) {
  const [summary, setSummary] = useState(initial);

  return (
    <div className="mb-6 rounded-xl border bg-card p-4 shadow-xs animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <CalendarClock className="size-5" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium">Billing run</p>
            <p className="text-xs text-muted-foreground">
              Activates confirmed subscriptions that have started and creates a draft invoice for every period due up to
              today. Runs automatically every day after 00:05; running it again never bills a period twice.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmAllDraftsButton count={draftCount} />
          <RunBillingButton onDone={setSummary} />
        </div>
      </div>

      {summary && (
        <div key={summary.finishedAt} className="mt-4 border-t pt-4 animate-in fade-in duration-500">
          <p className="mb-3 text-xs text-muted-foreground">
            Last {summary.trigger === "SCHEDULED" ? "scheduled" : "manual"} run{" "}
            {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
              new Date(summary.finishedAt),
            )}{" "}
            · billed up to {summary.today} ·{" "}
            <Link
              href="/dashboard/billing-runs"
              className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
            >
              Run history
            </Link>
          </p>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Metric label="Invoices created" value={summary.invoicesCreated} />
            <Metric label="Activated" value={summary.activated} />
            <Metric label="Already billed" value={summary.skippedDuplicates} />
            <Metric label="Auto-closed" value={summary.closed} />
            <Metric label="Errors" value={summary.errorCount} tone="red" />
          </div>
          {summary.errorCount > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-destructive">
              {summary.errors.slice(0, 10).map((error, i) => (
                <li key={`${error.subscriptionNumber}-${i}`}>
                  {error.subscriptionNumber}: {error.message}
                </li>
              ))}
              {summary.errorCount > 10 && <li>…and {summary.errorCount - 10} more</li>}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
