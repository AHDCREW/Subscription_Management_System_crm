"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { resetPassword } from "../actions";
import { PasswordChecklist, passwordMeetsRules } from "../password-checklist";
import { LinkInvalid } from "./link-invalid";
import { Alert, Button, Card, Field, Input } from "@/components/kit";

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const allMet = passwordMeetsRules(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  // The link expired or was used while the form was open.
  if (state?.invalid) return <LinkInvalid />;

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Choose a new password</h1>
          <p className="text-sm text-muted-foreground">You&apos;ll be signed out on every device once it&apos;s changed.</p>
        </div>
        {state?.error && <Alert>{state.error}</Alert>}
        <input type="hidden" name="token" value={token} />
        <Field label="New password">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <PasswordChecklist password={password} />
        <Field label="Confirm new password" error={mismatch ? "Passwords do not match." : undefined}>
          <Input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch || undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !allMet || confirm !== password}>
          {pending ? "Saving…" : "Reset password"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          <Link href="/login" className="text-indigo-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </form>
    </Card>
  );
}
