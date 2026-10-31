"use client";

import { useState, useTransition } from "react";
import { BellRing, Loader2 } from "lucide-react";
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
import { remindAllOverdue } from "./actions";

function reminders(n: number) {
  return `${n} reminder${n === 1 ? "" : "s"}`;
}

/** Emails a payment reminder for every overdue invoice, after a confirm dialog showing how many. */
export function RemindAllOverdueButton({ count }: { count: number }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function remindAll() {
    startTransition(async () => {
      try {
        const { sent, failed } = await remindAllOverdue();
        if (sent === 0 && failed === 0) toast.info("No overdue invoices to remind");
        else if (failed > 0) toast.warning(`Sent ${reminders(sent)} (${failed} failed)`);
        else toast.success(`Sent ${reminders(sent)}`);
        setOpen(false);
      } catch {
        toast.error("Could not send the reminders. Please try again.");
      }
    });
  }

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)} disabled={count === 0 || pending}>
        <BellRing className="size-4" aria-hidden />
        Remind all overdue
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remind all overdue customers?</DialogTitle>
            <DialogDescription>
              {count} overdue invoice{count === 1 ? "" : "s"} will each get a friendly payment reminder by email, with the
              balance and a link to pay online. This can take a moment.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={remindAll} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {pending ? "Sending…" : `Send ${reminders(count)}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
