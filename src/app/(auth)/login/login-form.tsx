"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login } from "../actions";
import { Alert, Button, Card, Field, Input } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <h1 className="text-lg font-semibold">Log in</h1>
        {state?.error && <Alert>{state.error}</Alert>}
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        </Field>
        <Field label="Password">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <div className="text-right text-sm">
          <Link href="/forgot-password" className="text-indigo-600 hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          New here?{" "}
          <Link href="/signup" className="text-indigo-600 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </Card>
  );
}
