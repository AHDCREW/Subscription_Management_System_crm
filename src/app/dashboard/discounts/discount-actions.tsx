"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Alert, Button } from "@/components/kit";
import { Button as IconButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteDiscount, setDiscountActive, type DiscountActionState } from "./actions";

type Target = { id: number; name: string; active: boolean };

// Activate/deactivate. `compact` is the quiet row-level version used in the table.
export function ToggleDiscount({ discount, compact }: { discount: Target; compact?: boolean }) {
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const formData = new FormData();
    formData.set("id", String(discount.id));
    formData.set("active", String(!discount.active));
    startTransition(async () => {
      const result = await setDiscountActive(formData);
      if (result?.ok) toast.success(result.message);
      else if (result?.error) toast.error(result.error);
    });
  };

  const label = discount.active ? "Deactivate" : "Activate";
  return compact ? (
    <IconButton type="button" variant="ghost" size="sm" className="text-muted-foreground" disabled={pending} onClick={toggle}>
      {label}
    </IconButton>
  ) : (
    <Button type="button" variant="secondary" disabled={pending} onClick={toggle}>
      {label}
    </Button>
  );
}

// Delete behind a confirm dialog. Pass `redirectTo` when deleting from the discount's own page.
export function DeleteDiscount({
  discount,
  compact,
  redirectTo,
}: {
  discount: Target;
  compact?: boolean;
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const [state, action, pending] = useActionState(async (_prev: DiscountActionState, formData: FormData) => {
    const result = await deleteDiscount(formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
    }
    return result;
  }, undefined);

  return (
    <>
      {compact ? (
        <IconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${discount.name}`}
          title={`Delete ${discount.name}`}
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setOpen(true)}
        >
          <Trash2 />
        </IconButton>
      ) : (
        <Button type="button" variant="danger" onClick={() => setOpen(true)}>
          Delete
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={action} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>Delete {discount.name}?</DialogTitle>
              <DialogDescription>This discount has never been used. This can&apos;t be undone.</DialogDescription>
            </DialogHeader>
            <input type="hidden" name="id" value={discount.id} />
            {state?.error && <Alert>{state.error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" variant="danger" disabled={pending}>
                {pending ? "Deleting…" : "Delete discount"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
