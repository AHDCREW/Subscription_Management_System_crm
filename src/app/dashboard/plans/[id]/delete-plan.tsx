"use client";

import { useActionState, useState } from "react";
import { Alert, Button } from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deletePlan } from "../actions";

// Shown only for plans nothing uses yet; the server checks again before deleting.
export function DeletePlan({ planId, planName }: { planId: number; planName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(deletePlan, undefined);

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={action} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete {planName}?</DialogTitle>
              <DialogDescription>
                No subscription or template uses this plan yet, so it can be deleted. This can&apos;t be undone.
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="id" value={planId} />
            {state?.error && <Alert>{state.error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Deleting…" : "Delete plan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
