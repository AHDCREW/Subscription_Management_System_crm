"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
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
import { changeRole, type RoleChangeState } from "./actions";

// Row action that moves a team member between Staff and Admin, after a confirm.
export function RoleButton({ userId, name, role }: { userId: number; name: string; role: "ADMIN" | "STAFF" }) {
  const [open, setOpen] = useState(false);
  const next = role === "ADMIN" ? "STAFF" : "ADMIN";
  const label = next === "ADMIN" ? "Make admin" : "Make staff";

  const [state, action, pending] = useActionState(async (prev: RoleChangeState, formData: FormData) => {
    const result = await changeRole(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);

  return (
    <>
      <RowButton type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`${label}: ${name}`}>
        {label}
      </RowButton>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <form action={action} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                {next === "ADMIN" ? `Make ${name} an admin?` : `Make ${name} staff?`}
              </DialogTitle>
              <DialogDescription>
                {next === "ADMIN"
                  ? "Admins can do everything, including managing plans, staff and company settings."
                  : "Staff handle day-to-day work but can't manage the catalog, staff or company settings."}
              </DialogDescription>
            </DialogHeader>
            <input type="hidden" name="id" value={userId} />
            <input type="hidden" name="role" value={next} />
            {state?.error && <Alert>{state.error}</Alert>}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="ghost">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : label}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
