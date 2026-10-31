"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Alert, Button } from "@/components/kit";
import { Button as RowButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { approveCustomer, rejectCustomer, type ApprovalState } from "./actions";

function notify(result: ApprovalState) {
  if (result?.ok) {
    if (result.warning) toast.warning(result.message);
    else toast.success(result.message);
  } else if (result?.error) {
    toast.error(result.error);
  }
}

// Row actions for a customer waiting for approval: approve right away, or
// reject after a confirm.
export function ApprovalButtons({ userId, name }: { userId: number; name: string }) {
  const [open, setOpen] = useState(false);

  const [, approve, approving] = useActionState(async (prev: ApprovalState, formData: FormData) => {
    const result = await approveCustomer(prev, formData);
    notify(result);
    return result;
  }, undefined);

  const [rejectState, reject, rejecting] = useActionState(async (prev: ApprovalState, formData: FormData) => {
    const result = await rejectCustomer(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);

  return (
    <div className="flex items-center justify-end gap-1">
      <form action={approve}>
        <input type="hidden" name="id" value={userId} />
        <RowButton type="submit" size="sm" disabled={approving || rejecting} aria-label={`Approve ${name}`}>
          <Check aria-hidden />
          {approving ? "Approving…" : "Approve"}
        </RowButton>
      </form>
      <RowButton
        type="button"
        variant="ghost"
        size="sm"
        disabled={approving}
        onClick={() => setOpen(true)}
        aria-label={`Reject ${name}`}
      >
        Reject
      </RowButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={reject} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Reject {name}&apos;s signup?</DialogTitle>
              <DialogDescription>
                Their account is deleted and they can&apos;t log in. They&apos;re not notified, and can sign up again
                with the same email later.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="id" value={userId} />
            {rejectState?.error && <Alert>{rejectState.error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={rejecting}>
                {rejecting ? "Rejecting…" : "Reject signup"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
