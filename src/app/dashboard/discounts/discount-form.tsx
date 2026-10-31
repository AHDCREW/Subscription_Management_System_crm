"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DiscountFormValues } from "@/lib/catalog/discounts";
import { Alert, Button, ButtonLink, Card, Checkbox, Field, Input, SectionHeader, Select, cx } from "@/components/kit";
import { saveDiscount, type DiscountActionState } from "./actions";

export type ProductOption = { id: number; name: string; active: boolean };

export function DiscountForm({
  discountId,
  initial,
  products,
  usedCount,
}: {
  discountId?: number;
  initial: DiscountFormValues;
  products: ProductOption[];
  usedCount?: number;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: DiscountActionState, formData: FormData) => {
    const result = await saveDiscount(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      router.push("/dashboard/discounts");
    }
    return result;
  }, undefined);

  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};
  const [type, setType] = useState(initial.type);
  const [scope, setScope] = useState(initial.scope);
  const chosen = new Set(values.productIds);

  return (
    <Card>
      {/* Re-key on each failed submit so the fields show what was typed, not the original defaults. */}
      <form key={JSON.stringify(state?.values ?? null)} action={action} className="space-y-6" noValidate>
        {discountId && <input type="hidden" name="id" value={discountId} />}
        {state?.error && <Alert>{state.error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" error={errors.name}>
              <Input
                name="name"
                required
                maxLength={120}
                defaultValue={values.name}
                placeholder="e.g. Diwali 10% off"
                aria-invalid={Boolean(errors.name)}
              />
            </Field>
          </div>

          <Field label="Type" error={errors.type}>
            <Select name="type" value={type} onChange={(e) => setType(e.target.value)} aria-invalid={Boolean(errors.type)}>
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED">Fixed amount</option>
            </Select>
          </Field>

          <Field
            label={type === "PERCENTAGE" ? "Value (%)" : "Value (₹)"}
            hint={type === "PERCENTAGE" ? "More than 0, up to 100." : "Amount taken off, more than 0."}
            error={errors.value}
          >
            <Input
              name="value"
              inputMode="decimal"
              required
              defaultValue={values.value}
              placeholder={type === "PERCENTAGE" ? "10" : "500"}
              aria-invalid={Boolean(errors.value)}
            />
          </Field>
        </div>

        <fieldset className="space-y-3 border-t border-border pt-6">
          <SectionHeader title="Applies to" description="The whole subscription, or only lines for chosen products." />
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {[
              { value: "SUBSCRIPTION", label: "Whole subscription" },
              { value: "PRODUCTS", label: "Specific products" },
            ].map((option) => (
              <label key={option.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="scope"
                  value={option.value}
                  checked={scope === option.value}
                  onChange={() => setScope(option.value)}
                  className="size-4 accent-primary"
                />
                {option.label}
              </label>
            ))}
          </div>

          {/* Hidden rather than unmounted so ticks survive switching back and forth. */}
          <div className={cx("space-y-1.5", scope !== "PRODUCTS" && "hidden")}>
            {products.length === 0 ? (
              <p className="text-sm text-muted-foreground">No active products yet.</p>
            ) : (
              <div
                className={cx(
                  "max-h-64 space-y-2 overflow-y-auto rounded-lg border bg-background p-3",
                  errors.productIds && "border-destructive",
                )}
              >
                {products.map((p) => (
                  <Checkbox
                    key={p.id}
                    name="productIds"
                    value={p.id}
                    label={p.active ? p.name : `${p.name} (inactive)`}
                    defaultChecked={chosen.has(String(p.id))}
                  />
                ))}
              </div>
            )}
            {errors.productIds && <p className="text-xs text-destructive">{errors.productIds}</p>}
          </div>
        </fieldset>

        <fieldset className="space-y-4 border-t border-border pt-6">
          <SectionHeader title="Conditions" description="Leave a field empty for no limit." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Minimum purchase (₹)" hint="Eligible lines must add up to at least this." error={errors.minPurchase}>
              <Input
                name="minPurchase"
                inputMode="decimal"
                defaultValue={values.minPurchase}
                placeholder="No minimum"
                aria-invalid={Boolean(errors.minPurchase)}
              />
            </Field>
            <Field label="Minimum quantity" hint="Total units across eligible lines." error={errors.minQuantity}>
              <Input
                name="minQuantity"
                inputMode="numeric"
                defaultValue={values.minQuantity}
                placeholder="No minimum"
                aria-invalid={Boolean(errors.minQuantity)}
              />
            </Field>
            <Field label="Start date" hint="Optional. Leave empty to start straight away." error={errors.startDate}>
              <Input name="startDate" type="date" defaultValue={values.startDate} aria-invalid={Boolean(errors.startDate)} />
            </Field>
            <Field label="End date" hint="Optional. Still applies on this day." error={errors.endDate}>
              <Input name="endDate" type="date" defaultValue={values.endDate} aria-invalid={Boolean(errors.endDate)} />
            </Field>
            <Field
              label="Usage limit"
              hint={
                usedCount !== undefined
                  ? `Used ${usedCount} ${usedCount === 1 ? "time" : "times"} so far. Stops once it reaches the limit.`
                  : "How many invoices it can be used on. Empty for unlimited."
              }
              error={errors.usageLimit}
            >
              <Input
                name="usageLimit"
                inputMode="numeric"
                defaultValue={values.usageLimit}
                placeholder="Unlimited"
                aria-invalid={Boolean(errors.usageLimit)}
              />
            </Field>
          </div>
        </fieldset>

        <Checkbox name="active" label="Active (applied to invoices while valid)" defaultChecked={values.active} />

        <div className="flex gap-2 border-t border-border pt-5">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : discountId ? "Save changes" : "Create discount"}
          </Button>
          <ButtonLink href="/dashboard/discounts" variant="ghost">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}
