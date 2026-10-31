"use client";

import { useState, useTransition } from "react";
import type { SubscriptionStatus } from "@prisma/client";
import { toast } from "sonner";
import { Button, Card, Field, SectionHeader, Select } from "@/components/kit";
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
import type { TransitionResult } from "@/lib/subscriptions/transitions";
import { cancelMySubscription, pauseMySubscription, renewMySubscription, resumeMySubscription } from "../actions";

type Props = {
  id: number;
  number: string;
  status: SubscriptionStatus;
  closable: boolean;
  pausable: boolean;
  renewable: boolean;
  // Preformatted start date, for the "starts on" note.
  startDate: string;
  // Current expiry as `YYYY-MM-DD` ("" when it runs until cancelled) and its display form.
  expiryInput: string;
  expiryDate: string;
  // Renewal length preselected in the Renew dialog (from the plan's billing period).
  defaultRenewalTerm: RenewalTerm;
};

type Confirming = "cancel" | "pause" | "renew";

// Self-service actions on the customer's own subscription, limited to what the
// plan allows. One primary at most: Resume when paused, otherwise Renew.
export function ManageSubscription({
  id,
  number,
  status,
  closable,
  pausable,
  renewable,
  startDate,
  expiryInput,
  expiryDate,
  defaultRenewalTerm,
}: Props) {
  const [pending, startTransition] = useTransition();
  // Kept while the dialog closes so its content doesn't blank mid-animation.
  const [confirming, setConfirmingKind] = useState<Confirming>("cancel");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [term, setTerm] = useState<RenewalTerm>(defaultRenewalTerm);

  const open = (kind: Confirming) => {
    setConfirmingKind(kind);
    if (kind === "renew") setTerm(defaultRenewalTerm);
    setDialogOpen(true);
  };
  const done = () => setDialogOpen(false);

  // Preview only; the server works the new date out again from the stored expiry.
  const currentExpiry = parseDateInput(expiryInput);
  const renewTo = currentExpiry ? formatDay(renewedExpiryDate(currentExpiry, term)) : "—";

  function run(action: () => Promise<TransitionResult>, onDone?: () => void) {
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

  if (status !== "ACTIVE" && status !== "PAUSED") {
    const note =
      status === "QUOTATION"
        ? "Quotations are confirmed by Brightloop's team. You can manage this subscription here once it is active."
        : status === "CONFIRMED"
          ? `Confirmed, starting ${startDate}. You can manage this subscription here once it is active.`
          : "This subscription has ended. Contact Brightloop if you'd like to start again.";
    return (
      <Card className="mb-6">
        <SectionHeader title="Manage subscription" />
        <p className="text-sm text-muted-foreground">{note}</p>
      </Card>
    );
  }

  const paused = status === "PAUSED";
  const pauseReason = pausable ? null : "Your plan can't be paused — contact Brightloop.";
  const renewReason = !renewable
    ? "Your plan can't be renewed — contact Brightloop."
    : !expiryInput
      ? "Your subscription runs until you cancel it, so there's nothing to renew."
      : null;
  const cancelReason = closable ? null : "Your plan can't be cancelled early — contact Brightloop.";
  const reasons = [paused ? null : pauseReason, renewReason, cancelReason].filter((reason) => reason !== null);

  const runsUntil = expiryInput ? ` Runs until ${expiryDate}.` : " Runs until you cancel it.";
  const hint = paused
    ? `Paused. You aren't billed while it is paused.${runsUntil}`
    : `Active and billed every period.${runsUntil}`;

  return (
    <Card className="mb-6">
      <SectionHeader title="Manage subscription" description={hint} />
      <div className="flex flex-wrap items-center gap-2">
        {paused ? (
          // The one primary on a paused subscription.
          <Button disabled={pending} onClick={() => run(() => resumeMySubscription(id))}>
            {pending ? "Resuming…" : "Resume"}
          </Button>
        ) : (
          <Button variant="secondary" disabled={pending || !!pauseReason} onClick={() => open("pause")}>
            Pause
          </Button>
        )}
        <Button
          // Renewing is the main thing to do on an active subscription.
          variant={paused || renewReason ? "secondary" : "primary"}
          disabled={pending || !!renewReason}
          onClick={() => open("renew")}
        >
          Renew
        </Button>
        <Button variant="danger" disabled={pending || !!cancelReason} onClick={() => open("cancel")}>
          Cancel subscription
        </Button>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={(next) => !pending && setDialogOpen(next)}>
        <DialogContent className="sm:max-w-md">
          {confirming === "pause" && (
            <>
              <DialogHeader>
                <DialogTitle>Pause {number}?</DialogTitle>
                <DialogDescription>
                  Billing stops while paused: no invoices are raised for it. When you resume, billing continues from that
                  day and the paused time isn&apos;t billed.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pending}>
                    Keep it active
                  </Button>
                </DialogClose>
                <Button disabled={pending} onClick={() => run(() => pauseMySubscription(id), done)}>
                  {pending ? "Pausing…" : "Pause subscription"}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirming === "renew" && (
            <>
              <DialogHeader>
                <DialogTitle>Renew {number}?</DialogTitle>
                <DialogDescription>
                  Your expiry date moves forward by the length you choose, on the same products and prices.
                </DialogDescription>
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
                    Not now
                  </Button>
                </DialogClose>
                <Button disabled={pending} onClick={() => run(() => renewMySubscription(id, expiryInput, term), done)}>
                  {pending ? "Renewing…" : `Renew until ${renewTo}`}
                </Button>
              </DialogFooter>
            </>
          )}

          {confirming === "cancel" && (
            <>
              <DialogHeader>
                <DialogTitle>Cancel {number}?</DialogTitle>
                <DialogDescription>
                  It ends today and no future invoices will be raised for it. Invoices you&apos;ve already received still
                  need to be paid. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={pending}>
                    Keep subscription
                  </Button>
                </DialogClose>
                <Button variant="danger" disabled={pending} onClick={() => run(() => cancelMySubscription(id), done)}>
                  {pending ? "Cancelling…" : "Cancel subscription"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
