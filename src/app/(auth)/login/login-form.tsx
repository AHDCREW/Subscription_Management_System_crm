"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/kit";

export function LoginForm({ passwordReset = false }: { passwordReset?: boolean }) {
  return (
    <>
      <Card>
        <h1 className="mb-4 text-lg font-semibold">Log in</h1>
        <LoginFields passwordReset={passwordReset} />
      </Card>
      <p className="mt-4 text-center text-sm">
        <Link href="/pricing" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
          View plans &amp; pricing
        </Link>
      </p>
    </>
  );
}

// The form itself, shared by the /login page and the login modal on the landing page.
export function LoginFields({ passwordReset = false }: { passwordReset?: boolean }) {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <form action={action} className="space-y-4">
      {passwordReset && !state?.error && !state?.pending && (
        <Alert tone="green">Your password has been reset. Log in with your new password.</Alert>
      )}
      {state?.error && <Alert>{state.error}</Alert>}
      {state?.pending && (
        <Alert tone="amber">
          Your account is waiting for approval by our team. We&apos;ll email you as soon as it&apos;s approved, then
          you can log in.
        </Alert>
      )}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="text-right text-sm">
        <Link href="/forgot-password" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Logging in…" : "Log in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        New here?{" "}
        <Link href="/signup" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
          Create an account
        </Link>
      </p>
    </form>
  );
}
