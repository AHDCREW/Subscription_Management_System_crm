"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Alert, Button, Field, Input } from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { addStaff, type AddStaffState } from "./actions";

export function AddStaffDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <UserPlus aria-hidden />
          Add staff
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so each opening starts with an empty form. */}
        {open && <AddStaffForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddStaffForm({ onDone }: { onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: AddStaffState, formData: FormData) => {
    const result = await addStaff(prev, formData);
    if (result?.ok) {
      if (result.warning) toast.warning(result.message);
      else toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const values = state?.values ?? { name: "", email: "" };
  const errors = state?.fieldErrors ?? {};

  return (
    <form key={JSON.stringify(state?.values ?? null)} action={action} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Add staff</DialogTitle>
        <DialogDescription>
          They&apos;ll get an email with a link to set their own password. The link works for 30 minutes; after that they
          can use &ldquo;Forgot password&rdquo; on the login page.
        </DialogDescription>
      </DialogHeader>

      {state?.error && <Alert>{state.error}</Alert>}

      <Field label="Name" error={errors.name}>
        <Input
          name="name"
          required
          maxLength={120}
          autoComplete="off"
          defaultValue={values.name}
          placeholder="e.g. Priya Sharma"
          aria-invalid={Boolean(errors.name)}
          autoFocus
        />
      </Field>
      <Field label="Email" error={errors.email}>
        <Input
          name="email"
          type="email"
          required
          maxLength={191}
          autoComplete="off"
          defaultValue={values.email}
          placeholder="name@brightloop.test"
          aria-invalid={Boolean(errors.email)}
        />
      </Field>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add staff"}
        </Button>
      </DialogFooter>
    </form>
  );
}
