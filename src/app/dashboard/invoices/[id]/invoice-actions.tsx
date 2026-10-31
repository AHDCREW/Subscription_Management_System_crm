"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Printer, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { InvoiceStatus } from "@prisma/client";
import { Button, ButtonLink, Card } from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cancelInvoice, confirmInvoice, type InvoiceActionResult } from "../actions";
import { RecordPaymentDialog } from "./record-payment-dialog";

const HINT: Record<InvoiceStatus, string> = {
  DRAFT: "Confirm the invoice to make it payable.",
  CONFIRMED: "Waiting for payment.",
  PAID: "Fully paid. Nothing left to do.",
  CANCELLED: "This invoice was cancelled.",
};

export function InvoiceActions({
  id,
  number,
  status,
  canConfirm,
  canCancel,
  hasPayments,
  payment,
}: {
  id: number;
  number: string;
  status: InvoiceStatus;
  canConfirm: boolean;
  canCancel: boolean;
  hasPayments: boolean;
  /** Set when the invoice can take a payment: the balance due, as a number and formatted. */
  payment: { balance: number; balanceLabel: string } | null;
}) {
  const [pending, startTransition] = useTransition();
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const open = status === "DRAFT" || status === "CONFIRMED";

  function run(action: () => Promise<InvoiceActionResult>, onDone?: () => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) toast.success(result.message, { description: number });
        else toast.error(result.error);
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
      onDone?.();
    });
  }

  return (
    <Card className="p-5">
      <p className="text-sm font-medium">Actions</p>
      <p className="mt-1 text-xs text-muted-foreground">{HINT[status]}</p>
      <div className="mt-4 grid gap-2">
        {payment && (
          <RecordPaymentDialog invoiceId={id} number={number} balance={payment.balance} balanceLabel={payment.balanceLabel} />
        )}
        {canConfirm && (
          <Button type="button" onClick={() => run(() => confirmInvoice(id))} disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
            Confirm invoice
          </Button>
        )}
        {open && (
          <Button type="button" variant="secondary" disabled title="Coming soon">
            <Send className="size-4" aria-hidden /> Send
            <span className="text-xs font-normal text-muted-foreground">Coming soon</span>
          </Button>
        )}
        <ButtonLink href={`/dashboard/invoices/${id}/print`} variant="secondary">
          <Printer className="size-4" aria-hidden /> Print
        </ButtonLink>
        {canCancel && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setConfirmingCancel(true)}
            disabled={pending}
          >
            <XCircle className="size-4" aria-hidden /> Cancel invoice
          </Button>
        )}
      </div>
      {open && hasPayments && (
        <p className="mt-3 text-xs text-muted-foreground">Payments are recorded on this invoice, so it can&apos;t be cancelled.</p>
      )}

      <Dialog open={confirmingCancel} onOpenChange={(next) => !pending && setConfirmingCancel(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel {number}?</DialogTitle>
            <DialogDescription>
              The customer will no longer owe this invoice and it can&apos;t be confirmed again. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Keep invoice
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => run(() => cancelInvoice(id), () => setConfirmingCancel(false))}
            >
              {pending ? "Cancelling…" : "Cancel invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
