"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { saveTemplate } from "./actions";
import type { PlanOption, ProductOption, TemplateFormValues } from "./data";
import { Alert, Button, ButtonLink, Card, Field, Input, Select, Textarea, cx } from "@/components/kit";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT, estimateRecurringTotal, lineAmount } from "@/lib/subscriptions/templates";

type Row = { key: number; productId: string; variantId: string; quantity: string };

const UNAVAILABLE = "Unavailable (inactive or deleted)";

function initialMinQuantity(plans: PlanOption[], planId: number | null) {
  return plans.find((p) => p.id === planId)?.minQuantity ?? 1;
}

export function TemplateForm({
  initial,
  plans,
  products,
}: {
  initial: TemplateFormValues;
  plans: PlanOption[];
  products: ProductOption[];
}) {
  const [state, action, pending] = useActionState(saveTemplate, undefined);

  const [name, setName] = useState(initial.name);
  const [planId, setPlanId] = useState(initial.planId ? String(initial.planId) : "");
  const [validityDays, setValidityDays] = useState(String(initial.validityDays));
  const [notes, setNotes] = useState(initial.notes);
  // A new template starts with one empty row so the rep can pick a product right away.
  const [rows, setRows] = useState<Row[]>(() =>
    initial.lines.length > 0
      ? initial.lines.map((line, index) => ({
          key: index,
          productId: String(line.productId),
          variantId: line.variantId ? String(line.variantId) : "",
          quantity: String(line.quantity),
        }))
      : [{ key: 0, productId: "", variantId: "", quantity: String(initialMinQuantity(plans, initial.planId)) }],
  );
  const [nextKey, setNextKey] = useState(Math.max(initial.lines.length, 1));

  const plan = plans.find((p) => String(p.id) === planId);
  const planMissing = planId !== "" && !plan;
  const minQuantity = plan?.minQuantity ?? 1;
  const productsById = new Map(products.map((p) => [String(p.id), p]));

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, { key: nextKey, productId: "", variantId: "", quantity: String(minQuantity) }]);
    setNextKey(nextKey + 1);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  // Submit through a transition instead of <form action> so React does not
  // reset the form (and the dynamic line rows) when validation fails.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(
      "lines",
      JSON.stringify(
        rows.map((row) => ({
          key: row.key,
          productId: row.productId,
          variantId: row.variantId ? row.variantId : null,
          quantity: row.quantity,
        })),
      ),
    );
    startTransition(() => action(formData));
  }

  const pricedLines = rows.flatMap((row) => {
    const product = productsById.get(row.productId);
    const quantity = Number(row.quantity);
    if (!product || !Number.isFinite(quantity) || quantity < 0) return [];
    const variant = product.variants.find((v) => String(v.id) === row.variantId);
    return [{ quantity, salesPrice: product.salesPrice, extraPrice: variant?.extraPrice ?? 0 }];
  });
  const productsTotal = estimateRecurringTotal(0, pricedLines);
  const total = estimateRecurringTotal(plan?.price ?? 0, pricedLines);
  const fieldErrors = state?.fieldErrors ?? {};
  const lineErrors = state?.lineErrors ?? {};

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {state?.error && <Alert>{state.error}</Alert>}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold text-slate-900">Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" error={fieldErrors.name}>
            <Input
              name="name"
              required
              maxLength={120}
              placeholder="e.g. Starter CRM"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field
            label="Plan"
            error={fieldErrors.planId}
            hint={plan ? `${PERIOD_LABEL[plan.billingPeriod]} · min. quantity ${plan.minQuantity} per line` : undefined}
          >
            <Select name="planId" required value={planId} onChange={(e) => setPlanId(e.target.value)}>
              <option value="">Choose a plan…</option>
              {planMissing && (
                <option value={planId} disabled>
                  {UNAVAILABLE}
                </option>
              )}
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMoney(p.price)} / {PERIOD_UNIT[p.billingPeriod]})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Validity (days)"
            error={fieldErrors.validityDays}
            hint="A quotation made from this template expires this many days after it is created."
          >
            <Input
              name="validityDays"
              type="number"
              required
              min={1}
              max={3650}
              step={1}
              value={validityDays}
              onChange={(e) => setValidityDays(e.target.value)}
            />
          </Field>
          <Field label="Notes" error={fieldErrors.notes} hint="Optional. Terms or remarks for quotations made from this template.">
            <Textarea name="notes" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Product lines</h2>
            <p className="text-sm text-slate-500">Prices are per billing period and exclude tax.</p>
          </div>
          <Button type="button" variant="secondary" onClick={addRow} disabled={products.length === 0}>
            + Add line
          </Button>
        </div>

        {fieldErrors.lines && <Alert>{fieldErrors.lines}</Alert>}

        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No product lines yet. Use “Add line” to add the products this template should include.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_8rem_auto] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid">
              <span>Product</span>
              <span>Variant</span>
              <span>Quantity</span>
              <span className="text-right">Amount</span>
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, index) => {
              const product = productsById.get(row.productId);
              const productMissing = row.productId !== "" && !product;
              const variants = product?.variants ?? [];
              const variant = variants.find((v) => String(v.id) === row.variantId);
              const variantMissing = row.variantId !== "" && !!product && !variant;
              const quantity = Number(row.quantity);
              const amount =
                product && Number.isFinite(quantity) && quantity >= 0
                  ? lineAmount({ quantity, salesPrice: product.salesPrice, extraPrice: variant?.extraPrice })
                  : null;
              const error = lineErrors[String(row.key)];

              return (
                <div key={row.key} className="space-y-1">
                  <div
                    className={cx(
                      "grid gap-3 rounded-md p-1 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_8rem_auto] md:items-center",
                      error && "bg-rose-50/60 ring-1 ring-rose-200",
                    )}
                  >
                    <Select
                      aria-label={`Line ${index + 1} product`}
                      required
                      value={row.productId}
                      onChange={(e) => updateRow(row.key, { productId: e.target.value, variantId: "" })}
                    >
                      <option value="">Choose a product…</option>
                      {productMissing && (
                        <option value={row.productId} disabled>
                          {UNAVAILABLE}
                        </option>
                      )}
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatMoney(p.salesPrice)})
                        </option>
                      ))}
                    </Select>
                    <Select
                      aria-label={`Line ${index + 1} variant`}
                      value={row.variantId}
                      disabled={!product || (variants.length === 0 && !variantMissing)}
                      onChange={(e) => updateRow(row.key, { variantId: e.target.value })}
                    >
                      <option value="">{product && variants.length === 0 ? "No variants" : "No variant"}</option>
                      {variantMissing && (
                        <option value={row.variantId} disabled>
                          {UNAVAILABLE}
                        </option>
                      )}
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                          {v.extraPrice ? ` (+${formatMoney(v.extraPrice)})` : ""}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Line ${index + 1} quantity`}
                      type="number"
                      required
                      min={minQuantity}
                      step={1}
                      value={row.quantity}
                      onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                    />
                    <span className="text-right text-sm tabular-nums text-slate-700">
                      {amount === null ? "—" : formatMoney(amount)}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-self-end"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      Remove
                    </Button>
                  </div>
                  {error && <p className="px-1 text-xs text-rose-600">{error}</p>}
                </div>
              );
            })}
          </div>
        )}

        <dl className="ml-auto max-w-xs space-y-1 border-t border-slate-200 pt-4 text-sm">
          <div className="flex justify-between gap-4 text-slate-600">
            <dt>Plan base fee</dt>
            <dd className="tabular-nums">{plan ? formatMoney(plan.price) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 text-slate-600">
            <dt>Products</dt>
            <dd className="tabular-nums">{formatMoney(productsTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 font-semibold text-slate-900">
            <dt>Estimated total{plan ? ` / ${PERIOD_UNIT[plan.billingPeriod]}` : ""}</dt>
            <dd className="tabular-nums">{formatMoney(total)}</dd>
          </div>
          <p className="pt-1 text-xs text-slate-500">Before tax and discounts.</p>
        </dl>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/dashboard/templates" variant="secondary">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : initial.id ? "Save changes" : "Create template"}
        </Button>
      </div>
    </form>
  );
}
