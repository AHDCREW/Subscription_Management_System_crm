"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { withdrawMyRequest } from "../actions";

// Withdraws the customer's own request while it is still with the team, behind a confirm.
export function WithdrawRequest({ id, number }: { id: number; number: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  function withdraw() {
    startTransition(async () => {
      const result = await withdrawMyRequest(id);
      if (result.ok) {
        toast.success(result.message);
        setOpen(false);
        router.push("/portal/subscriptions");
      } else {
        toast.error(result.error);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Withdraw request
      </Button>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw {number}?</DialogTitle>
          <DialogDescription>
            Our team stops working on it and it is removed from your account. You can always send a new request.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              Keep request
            </Button>
          </DialogClose>
          <Button variant="danger" disabled={pending} onClick={withdraw}>
            {pending ? "Withdrawing…" : "Withdraw request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
