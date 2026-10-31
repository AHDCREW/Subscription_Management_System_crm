"use client";

import { useState, useTransition, type ReactNode } from "react";
import type { SubscriptionStatus } from "@prisma/client";
import { toast } from "sonner";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  backToDraft,
  closeSubscription,
  confirmSubscription,
  sendQuotation,
  type StatusActionResult,
} from "../status-actions";

type Props = {
  id: number;
  number: string;
  status: SubscriptionStatus;
  closable: boolean;
  quoteExpired: boolean;
  // Preformatted dates ("—" when empty).
  quotationExpiresAt: string;
  startDate: string;
  closedAt: string;
};

// The status changes valid for the current status, with one primary at most.
export function StatusActions({ id, number, status, closable, quoteExpired, quotationExpiresAt, startDate, closedAt }: Props) {
  const [pending, startTransition] = useTransition();
  const [closing, setClosing] = useState(false);

  function run(action: (id: number) => Promise<StatusActionResult>, onDone?: () => void) {
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        toast.success(result.message);
        onDone?.();
      } else {
        toast.error(result.error);
      }
    });
  }

  if (status === "CLOSED") {
    return <p className="text-sm text-muted-foreground">Closed on {closedAt}.</p>;
  }

  let hint: string;
  let actions: ReactNode;

  if (status === "DRAFT") {
    hint = "Send the quotation to the customer when the lines are ready.";
    actions = (
      <Button disabled={pending} onClick={() => run(sendQuotation)}>
        Send quotation
      </Button>
    );
  } else if (status === "QUOTATION") {
    hint = quoteExpired
      ? `The quotation expired on ${quotationExpiresAt}. Move it back to draft to send a new one.`
      : `Waiting for the customer. The quotation is valid until ${quotationExpiresAt}.`;
    actions = (
      <>
        <Button variant={quoteExpired ? "secondary" : "ghost"} disabled={pending} onClick={() => run(backToDraft)}>
          Back to draft
        </Button>
        <Button disabled={pending || quoteExpired} onClick={() => run(confirmSubscription)}>
          Confirm
        </Button>
      </>
    );
  } else {
    const allowed = status === "CONFIRMED" || closable;
    hint =
      status === "CONFIRMED"
        ? `Becomes active on ${startDate}, when the billing run picks it up.`
        : status === "PAUSED"
          ? "Paused. No invoices are raised while it is paused."
          : "Active and invoiced every billing period.";
    const closeButton = (
      <Button variant="danger" disabled={pending || !allowed} onClick={() => setClosing(true)}>
        Close subscription
      </Button>
    );
    actions = allowed ? (
      closeButton
    ) : (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Disabled buttons don't get pointer or focus events, so the wrapper carries the tooltip. */}
          <span tabIndex={0} aria-label="This plan can't be closed early" className="inline-flex rounded-lg">
            {closeButton}
          </span>
        </TooltipTrigger>
        <TooltipContent>This plan can&apos;t be closed early.</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{hint}</p>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>

      <Dialog open={closing} onOpenChange={(open) => !pending && setClosing(open)}>
        <DialogContent className="sm:max-w-md">
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
            <Button variant="danger" disabled={pending} onClick={() => run(closeSubscription, () => setClosing(false))}>
              {pending ? "Closing…" : "Close subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
