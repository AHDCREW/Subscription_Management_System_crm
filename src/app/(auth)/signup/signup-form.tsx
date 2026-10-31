"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "../actions";
import { PasswordChecklist, passwordMeetsRules } from "../password-checklist";
import { Alert, Button, Card, Field, Input } from "@/components/kit";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [password, setPassword] = useState("");
  const allMet = passwordMeetsRules(password);

  return (
    <Card>
      <form action={action} className="space-y-4">
        <h1 className="text-lg font-semibold">Create your account</h1>
        {state?.error && <Alert>{state.error}</Alert>}
        <Field label="Full name">
          <Input name="name" autoComplete="name" required defaultValue={state?.name} />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required defaultValue={state?.email} />
        </Field>
        <Field label="Password">
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <PasswordChecklist password={password} />
        <Field label="Confirm password">
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !allMet}>
          {pending ? "Creating account…" : "Sign up"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground">
            Log in
          </Link>
        </p>
      </form>
    </Card>
  );
}
