"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { SubscriptionStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button, Field, Select } from "@/components/kit";
import {
  RENEWAL_TERM_LABEL,
  RENEWAL_TERMS,
  formatDay,
  isRenewalTerm,
  parseDateInput,
  renewedExpiryDate,
  type RenewalTerm,
} from "@/lib/subscriptions/subscriptions";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  backToDraft,
  closeSubscription,
  confirmSubscription,
  pauseSubscription,
  renewSubscription,
  resumeSubscription,
  sendQuotation,
  type StatusActionResult,
} from "../status-actions";

type Props = {
  id: number;
  number: string;
  status: SubscriptionStatus;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
  quoteExpired: boolean;
  // Preformatted dates ("—" when empty).
  quotationExpiresAt: string;
  startDate: string;
  closedAt: string;
  pausedSince: string;
  // Current expiry as `YYYY-MM-DD` ("" when it runs until closed) and its display form.
  expiryInput: string;
  expiryDate: string;
  // Renewal length preselected in the Renew dialog (from the plan's billing period).
  defaultRenewalTerm: RenewalTerm;
};

type Confirming = "close" | "pause" | "renew" | null;

// Wraps a disabled button so its reason still shows on hover and focus.
function Explained({ reason, children }: { reason: string | null; children: ReactNode }) {
  if (!reason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Disabled buttons don't get pointer or focus events, so the wrapper carries the tooltip. */}
        <span tabIndex={0} aria-label={reason} className="inline-flex rounded-lg">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}

// The status changes valid for the current status, with one primary at most.
export function StatusActions({
  id,
  number,
  status,
  closable,
  pausable,
  renewable,
  quoteExpired,
  quotationExpiresAt,
  startDate,
  closedAt,
  pausedSince,
  expiryInput,
  expiryDate,
  defaultRenewalTerm,
}: Props) {
  const [pending, startTransition] = useTransition();
  // Which confirm dialog to show; kept while it closes so the content doesn't blank mid-animation.
  const [confirming, setConfirmingKind] = useState<Confirming>("close");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [term, setTerm] = useState<RenewalTerm>(defaultRenewalTerm);
  const setConfirming = (kind: Confirming) => {
    if (kind) setConfirmingKind(kind);
    if (kind === "renew") setTerm(defaultRenewalTerm);
    setDialogOpen(kind !== null);
  };
  // Preview only; the server works the new date out again from the stored expiry.
  const currentExpiry = parseDateInput(expiryInput);
  const renewTo = currentExpiry ? formatDay(renewedExpiryDate(currentExpiry, term)) : "—";

  function run(action: () => Promise<StatusActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(result.message);
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  const done = () => setConfirming(null);

  if (status === "CLOSED") {
    return <p className="text-sm text-muted-foreground">Closed on {closedAt}.</p>;
  }

  let hint: string;
  let actions: ReactNode;

  if (status === "DRAFT") {
    hint = "Send the quotation to the customer when the lines are ready.";
    actions = (
      <Button disabled={pending} onClick={() => run(() => sendQuotation(id))}>
        Send quotation
      </Button>
    );
  } else if (status === "QUOTATION") {
    hint = quoteExpired
      ? `The quotation expired on ${quotationExpiresAt}. Move it back to draft to send a new one.`
      : `Waiting for the customer. The quotation is valid until ${quotationExpiresAt}.`;
    actions = (
      <>
        <Button variant={quoteExpired ? "secondary" : "ghost"} disabled={pending} onClick={() => run(() => backToDraft(id))}>
          Back to draft
        </Button>
        <Button disabled={pending || quoteExpired} onClick={() => run(() => confirmSubscription(id))}>
          Confirm
        </Button>
      </>
    );
  } else {
    const runsUntil = expiryInput ? ` Runs until ${expiryDate}.` : " Runs until closed.";
    hint =
      status === "CONFIRMED"
        ? `Becomes active on ${startDate}, when the billing run picks it up.`
        : status === "PAUSED"
          ? `Paused since ${pausedSince}. No invoices are raised while it is paused.${runsUntil}`
          : `Active and invoiced every billing period.${runsUntil}`;

    const closeReason = status === "CONFIRMED" || closable ? null : "This plan can't be closed early.";
    const pauseReason = pausable ? null : "This plan can't be paused.";
    const renewReason = !renewable
      ? "This plan can't be renewed."
      : !expiryInput
        ? "No expiry date. It runs until closed, so there is nothing to renew."
        : null;

    actions = (
      <>
        {status === "ACTIVE" && (
          <Explained reason={pauseReason}>
            <Button variant="secondary" disabled={pending || !!pauseReason} onClick={() => setConfirming("pause")}>
              Pause
            </Button>
          </Explained>
        )}
        {(status === "ACTIVE" || status === "PAUSED") && (
          <Explained reason={renewReason}>
            <Button variant="secondary" disabled={pending || !!renewReason} onClick={() => setConfirming("renew")}>
              Renew
            </Button>
          </Explained>
        )}
        <Explained reason={closeReason}>
          <Button variant="danger" disabled={pending || !!closeReason} onClick={() => setConfirming("close")}>
            Close subscription
          </Button>
        </Explained>
        {status === "PAUSED" && (
          // The one primary on a paused subscription.
          <Button disabled={pending} onClick={() => run(() => resumeSubscription(id))}>
            {pending ? "Resuming…" : "Resume"}
          </Button>
        )}
      </>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !pending && setDialogOpen(open)}>
        <DialogContent className="sm:max-w-md">
          {confirming === "close" && (
            <>
              <DialogHeader>
                <DialogTitle>Close {number}?</DialogTitle>
                <DialogDescription>
                  {status === "CONFIRMED"
                    ? "It hasn't started yet, so it will end without ever being invoiced. This can't be undone."
                    : "It ends today and won't be invoiced again. This can't be undone."}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button variant="danger" disabled={pending} onClick={() => run(() => closeSubscription(id), done)}>
                  {pending ? "Closing…" : "Close subscription"}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirming === "pause" && (
            <>
              <DialogHeader>
                <DialogTitle>Pause {number}?</DialogTitle>
                <DialogDescription>
                  Billing stops while it is paused: the billing run raises no invoices for it. When you resume, billing
                  continues from that day and the paused time is not billed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={pending} onClick={() => run(() => pauseSubscription(id), done)}>
                  {pending ? "Pausing…" : "Pause subscription"}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirming === "renew" && (
            <>
              <DialogHeader>
                <DialogTitle>Renew {number}?</DialogTitle>
                <DialogDescription>The expiry date moves forward by the length you choose, on the same lines and prices.</DialogDescription>
              </DialogHeader>
              <Field label="Renew for">
                <Select
                  value={term}
                  disabled={pending}
                  onChange={(event) => isRenewalTerm(event.target.value) && setTerm(event.target.value)}
                >
                  {RENEWAL_TERMS.map((option) => (
                    <option key={option} value={option}>
                      {RENEWAL_TERM_LABEL[option]}
                    </option>
                  ))}
                </Select>
              </Field>
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Current expiry</dt>
                  <dd className="tabular-nums">{expiryDate}</dd>
                </div>
                <div className="flex justify-between gap-4 font-semibold">
                  <dt>New expiry</dt>
                  <dd className="tabular-nums">{renewTo}</dd>
                </div>
              </dl>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button disabled={pending} onClick={() => run(() => renewSubscription(id, expiryInput, term), done)}>
                  {pending ? "Renewing…" : `Renew until ${renewTo}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
