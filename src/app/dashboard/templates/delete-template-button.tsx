"use client";

import { useActionState, type FormEvent } from "react";
import { deleteTemplate } from "./actions";
import { Alert, Button } from "@/components/ui";

export function DeleteTemplateButton({ id, name }: { id: number; name: string }) {
  const [state, action, pending] = useActionState(deleteTemplate, undefined);

  function confirmDelete(event: FormEvent<HTMLFormElement>) {
    if (!window.confirm(`Delete the template “${name}”? This cannot be undone.`)) event.preventDefault();
  }

  return (
    <form action={action} onSubmit={confirmDelete} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      {state?.error && <Alert>{state.error}</Alert>}
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? "Deleting…" : "Delete template"}
      </Button>
    </form>
  );
}
