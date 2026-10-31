"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signup } from "../actions";
import { PASSWORD_RULES } from "@/lib/password";
import { Alert, Button, Card, Field, Input, cx } from "@/components/kit";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  const [password, setPassword] = useState("");
  const allMet = PASSWORD_RULES.every((rule) => rule.test(password));

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
        <ul className="space-y-1 text-xs">
          {PASSWORD_RULES.map((rule) => {
            const met = rule.test(password);
            return (
              <li key={rule.id} className={cx("flex items-center gap-2", met ? "text-emerald-600" : "text-slate-500")}>
                <span aria-hidden>{met ? "✓" : "○"}</span>
                {rule.label}
              </li>
            );
          })}
        </ul>
        <Field label="Confirm password">
          <Input name="confirm" type="password" autoComplete="new-password" required />
        </Field>
        <Button type="submit" className="w-full" disabled={pending || !allMet}>
          {pending ? "Creating account…" : "Sign up"}
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo-600 hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </Card>
  );
}
