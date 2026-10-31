"use client";

import Link from "next/link";
import { useActionState } from "react";
import { forgotPassword } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/kit";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Forgot your password?</h1>
          <p className="text-sm text-muted-foreground">
            Enter the email you signed up with and we&apos;ll send you a link to choose a new one.
          </p>
        </div>
        {state?.error && <Alert>{state.error}</Alert>}
        {state?.sent && (
          <Alert tone="green">
            If an account exists for that email, we&apos;ve sent a reset link. It expires in 30 minutes.
          </Alert>
        )}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        </Field>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Sending link…" : state?.sent ? "Send again" : "Send reset link"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          Remembered it?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Back to log in
          </Link>
        </p>
      </form>
    </Card>
  );
}
