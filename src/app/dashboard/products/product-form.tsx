"use client";

import { useActionState } from "react";
import { saveProduct } from "./actions";
import { PRODUCT_TYPES } from "@/lib/catalog/product-types";
import type { ProductFormValues } from "@/lib/catalog/products";
import { Alert, Button, ButtonLink, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/ui";

export type TaxOption = { id: number; label: string };

export function ProductForm({
  productId,
  initial,
  taxes,
}: {
  productId?: number;
  initial: ProductFormValues;
  taxes: TaxOption[];
}) {
  const [state, action, pending] = useActionState(saveProduct, undefined);
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};

  return (
    <Card>
      {/* Re-key on each failed submit so the fields show what was typed, not the original defaults. */}
      <form key={JSON.stringify(state?.values ?? null)} action={action} className="space-y-5" noValidate>
        {productId && <input type="hidden" name="id" value={productId} />}
        {state?.error && <Alert>{state.error}</Alert>}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" error={errors.name}>
              <Input name="name" required maxLength={160} defaultValue={values.name} placeholder="e.g. Brightloop CRM" />
            </Field>
          </div>

          <Field label="Type" error={errors.type}>
            <Select name="type" defaultValue={values.type}>
              {PRODUCT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Default tax" hint="Applied to new subscription lines for this product." error={errors.taxId}>
            <Select name="taxId" defaultValue={values.taxId}>
              <option value="">No tax</option>
              {taxes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Sales price (₹)" hint="Price per unit charged to the customer." error={errors.salesPrice}>
            <Input
              name="salesPrice"
              inputMode="decimal"
              required
              defaultValue={values.salesPrice}
              placeholder="0.00"
            />
          </Field>

          <Field label="Cost price (₹)" hint="Optional. Your own cost, used for margin." error={errors.costPrice}>
            <Input name="costPrice" inputMode="decimal" defaultValue={values.costPrice} placeholder="0.00" />
          </Field>

          <div className="sm:col-span-2">
            <Field label="Notes" error={errors.notes}>
              <Textarea name="notes" maxLength={5000} defaultValue={values.notes} />
            </Field>
          </div>
        </div>

        <Checkbox name="active" label="Active (can be added to new subscriptions)" defaultChecked={values.active} />

        <div className="flex gap-2 border-t border-slate-100 pt-5">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : productId ? "Save changes" : "Create product"}
          </Button>
          <ButtonLink href="/dashboard/products" variant="secondary">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </Card>
  );
}
