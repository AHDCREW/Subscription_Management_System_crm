"use client";

import { useActionState } from "react";
import { savePlan } from "./actions";
import { BILLING_PERIODS, PLAN_FLAGS } from "@/lib/catalog/plan-options";
import type { PlanFormValues } from "@/lib/catalog/plans";
import { Alert, Button, ButtonLink, Card, Field, Input, SectionHeader, Select } from "@/components/kit";

export function PlanForm({
  planId,
  initial,
  usedBy = 0,
}: {
  planId?: number;
  initial: PlanFormValues;
  usedBy?: number;
}) {
  const [state, action, pending] = useActionState(savePlan, undefined);
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      {/* Re-key on each failed submit so the fields show what was typed, not the original defaults. */}
      <form key={JSON.stringify(state?.values ?? null)} action={action} className="space-y-6" noValidate>
        {planId && <input type="hidden" name="id" value={planId} />}
        {state?.error && <Alert>{state.error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" error={errors.name}>
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={values.name}
                placeholder="e.g. Monthly Pro"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
          </div>

          <Field
            label="Price (₹)"
            hint={usedBy > 0 ? "Billed as a base fee. New invoices use the new price." : "Billed as a base fee each period. Use 0 for none."}
            error={errors.price}
          >
            <Input
              name="price"
              inputMode="decimal"
              required
              defaultValue={values.price}
              placeholder="0.00"
              aria-invalid={Boolean(errors.price)}
            />
          </Field>

          <Field label="Billing period" hint="How often an invoice is raised." error={errors.billingPeriod}>
            <Select name="billingPeriod" defaultValue={values.billingPeriod} aria-invalid={Boolean(errors.billingPeriod)}>
              {BILLING_PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Minimum quantity" hint="Each subscription line needs at least this many units." error={errors.minQuantity}>
            <Input
              name="minQuantity"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              required
              defaultValue={values.minQuantity}
              aria-invalid={Boolean(errors.minQuantity)}
            />
          </Field>

          <div className="hidden sm:block" />

          <Field label="Available from" hint="Optional. Leave empty to sell it straight away." error={errors.startDate}>
            <Input name="startDate" type="date" defaultValue={values.startDate} aria-invalid={Boolean(errors.startDate)} />
          </Field>

          <Field label="Available until" hint="Optional. Leave empty for no end date." error={errors.endDate}>
            <Input name="endDate" type="date" defaultValue={values.endDate} aria-invalid={Boolean(errors.endDate)} />
          </Field>
        </div>

        <div className="border-t pt-6">
          <SectionHeader title="Options" description="Decide, plan by plan, what can happen to subscriptions on it." />
          <div className="space-y-3">
            {PLAN_FLAGS.map((flag) => (
              <OptionCheckbox key={flag.key} name={flag.key} label={flag.label} help={flag.help} defaultChecked={values[flag.key]} />
            ))}
            <OptionCheckbox
              name="active"
              label="Active"
              help="Can be chosen on new subscriptions and quotation templates."
              defaultChecked={values.active}
            />
          </div>
        </div>

        <div className="flex gap-2 border-t pt-6">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : planId ? "Save changes" : "Create plan"}
          </Button>
          <ButtonLink href="/dashboard/plans" variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}

function OptionCheckbox({
  name,
  label,
  help,
  defaultChecked,
}: {
  name: string;
  label: string;
  help: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-0.5 size-4 rounded border-input accent-primary" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}
