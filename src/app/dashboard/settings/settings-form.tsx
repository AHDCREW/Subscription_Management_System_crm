"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { Alert, Button, Card, Field, Input, SectionHeader, Textarea } from "@/components/kit";
import { saveSettings, type SettingsState, type SettingsValues } from "./actions";

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const [state, action, pending] = useActionState(async (prev: SettingsState, formData: FormData) => {
    const result = await saveSettings(prev, formData);
    if (result?.ok) toast.success("Company settings saved.");
    return result;
  }, undefined);
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      {/* Re-key after each submit so the fields show what was typed (or saved), not the original defaults. */}
      <form key={JSON.stringify(state?.values ?? null)} action={action} className="space-y-6" noValidate>
        {state?.error && <Alert>{state.error}</Alert>}

        <section>
          <SectionHeader title="Business details" description="Printed on every invoice and shown in the customer portal." />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Company name" error={errors.name}>
                <Input name="name" required maxLength={160} defaultValue={values.name} aria-invalid={Boolean(errors.name)} />
              </Field>
            </div>
            <Field label="Email" hint="Optional. Where customers can reach billing." error={errors.email}>
              <Input name="email" type="email" maxLength={191} defaultValue={values.email} aria-invalid={Boolean(errors.email)} />
            </Field>
            <Field label="Phone" hint="Optional." error={errors.phone}>
              <Input name="phone" type="tel" maxLength={40} defaultValue={values.phone} aria-invalid={Boolean(errors.phone)} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Address" hint="Optional." error={errors.address}>
                <Textarea name="address" maxLength={1000} defaultValue={values.address} aria-invalid={Boolean(errors.address)} />
              </Field>
            </div>
            <Field label="GST number" hint="Optional. e.g. 29ABCDE1234F1Z5" error={errors.gstNumber}>
              <Input
                name="gstNumber"
                maxLength={30}
                defaultValue={values.gstNumber}
                className="uppercase"
                aria-invalid={Boolean(errors.gstNumber)}
              />
            </Field>
          </div>
        </section>

        <section className="border-t pt-6">
          <SectionHeader title="Invoicing" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint="3-letter code, e.g. INR." error={errors.currency}>
              <Input
                name="currency"
                required
                maxLength={3}
                defaultValue={values.currency}
                className="uppercase"
                aria-invalid={Boolean(errors.currency)}
              />
            </Field>
            <Field
              label="Invoice prefix"
              hint={`2–10 letters or numbers. New invoices are numbered ${(values.invoiceTag || "INV").toUpperCase()}-00042.`}
              error={errors.invoiceTag}
            >
              <Input
                name="invoiceTag"
                required
                maxLength={10}
                defaultValue={values.invoiceTag}
                className="uppercase"
                aria-invalid={Boolean(errors.invoiceTag)}
              />
            </Field>
          </div>
        </section>

        <div className="border-t pt-6">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save settings"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
