"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Input, SectionHeader, Textarea } from "@/components/kit";
import { PASSWORD_RULES_ID, PasswordChecklist, passwordMeetsRules } from "@/app/(auth)/password-checklist";
import {
  changePassword,
  saveDetails,
  type DetailsState,
  type DetailsValues,
  type PasswordState,
} from "./actions";

export function DetailsForm({ email, initial }: { email: string; initial: DetailsValues }) {
  const [state, action, pending] = useActionState(async (prev: DetailsState, formData: FormData) => {
    const result = await saveDetails(prev, formData);
    if (result?.ok) toast.success("Details saved");
    return result;
  }, undefined);
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      <SectionHeader title="Your details" description="These details appear on your invoices." />
      {/* Re-key after each submit so the fields show what was typed (or saved), not the original defaults. */}
      <form key={JSON.stringify(state?.values ?? null)} action={action} className="space-y-4" noValidate>
        {state?.error && <Alert>{state.error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" error={errors.name}>
            <Input
              name="name"
              required
              maxLength={120}
              autoComplete="name"
              defaultValue={values.name}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Email" hint="Your login. To use a different email, contact us.">
            <Input type="email" value={email} readOnly disabled />
          </Field>
          <Field label="Company" hint="Optional." error={errors.company}>
            <Input
              name="company"
              maxLength={160}
              autoComplete="organization"
              defaultValue={values.company}
              aria-invalid={Boolean(errors.company)}
            />
          </Field>
          <Field label="Phone" hint="Optional." error={errors.phone}>
            <Input
              name="phone"
              type="tel"
              maxLength={40}
              autoComplete="tel"
              defaultValue={values.phone}
              aria-invalid={Boolean(errors.phone)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" hint="Optional. Used as the billing address on invoices." error={errors.address}>
              <Textarea
                name="address"
                maxLength={1000}
                autoComplete="street-address"
                defaultValue={values.address}
                aria-invalid={Boolean(errors.address)}
              />
            </Field>
          </div>
        </div>
        <div className="border-t pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save details"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, action, pending] = useActionState(async (prev: PasswordState, formData: FormData) => {
    const result = await changePassword(prev, formData);
    if (result?.ok) {
      toast.success("Password changed");
      setPassword("");
      setConfirm("");
    }
    return result;
  }, undefined);
  const errors = state?.fieldErrors ?? {};
  const allMet = passwordMeetsRules(password);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <Card>
      <SectionHeader title="Change password" description="You'll be signed out on your other devices once it's changed." />
      <form action={action} className="max-w-md space-y-4" noValidate>
        {state?.error && <Alert>{state.error}</Alert>}
        <Field label="Current password" error={errors.current}>
          <Input
            name="current"
            type="password"
            autoComplete="current-password"
            required
            aria-invalid={Boolean(errors.current)}
          />
        </Field>
        <Field label="New password" error={errors.password}>
          <Input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={Boolean(errors.password)}
            value={password}
            aria-describedby={PASSWORD_RULES_ID}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <PasswordChecklist password={password} />
        <Field label="Confirm new password" error={mismatch ? "Passwords do not match." : errors.confirm}>
          <Input
            name="confirm"
            type="password"
            autoComplete="new-password"
            required
            aria-invalid={mismatch || Boolean(errors.confirm) || undefined}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <div className="border-t pt-4">
          <Button type="submit" variant="secondary" disabled={pending || !allMet || confirm !== password}>
            {pending ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
