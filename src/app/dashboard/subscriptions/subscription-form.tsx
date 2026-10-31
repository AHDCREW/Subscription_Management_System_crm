"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";
import { saveSubscription, type SaveSubscriptionResult } from "./actions";
import type { CustomerOption, SubscriptionFormOptions, SubscriptionFormValues } from "./data";
import { CustomerPicker } from "./customer-picker";
import { Alert, Button, ButtonLink, Card, Field, Input, Select, Textarea, cx } from "@/components/kit";
import { formatMoney, round2 } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import {
  PAYMENT_TERM_PRESETS,
  addDays,
  formatDay,
  isPlanAvailableOn,
  lineSubtotal,
  parseDateInput,
  paymentTermsLabel,
  subscriptionTotals,
} from "@/lib/subscriptions/subscriptions";

type Row = { key: number; productId: string; variantId: string; quantity: string; unitPrice: string; taxId: string };

const UNAVAILABLE = "Unavailable (inactive or deleted)";
const GRID = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_5.5rem_7.5rem_minmax(0,1.3fr)_7rem_2.25rem]";

export function SubscriptionForm({
  initial,
  options,
  initialCustomers,
  today,
}: {
  initial: SubscriptionFormValues;
  options: SubscriptionFormOptions;
  initialCustomers: CustomerOption[];
  today: string;
}) {
  const { plans, products, taxes, templates } = options;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SaveSubscriptionResult | null>(null);
  const isNew = !initial.id;

  const [customer, setCustomer] = useState<CustomerOption | null>(initial.customer);
  const [templateId, setTemplateId] = useState(initial.templateId ? String(initial.templateId) : "");
  const [planId, setPlanId] = useState(initial.planId ? String(initial.planId) : "");
  const [startDate, setStartDate] = useState(initial.startDate);
  const [expiryDate, setExpiryDate] = useState(initial.expiryDate);
  const [paymentTermDays, setPaymentTermDays] = useState(String(initial.paymentTermDays));
  const [notes, setNotes] = useState(initial.notes);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.lines.length > 0
      ? initial.lines.map((line, index) => ({
          key: index,
          productId: String(line.productId),
          variantId: line.variantId ? String(line.variantId) : "",
          quantity: String(line.quantity),
          unitPrice: line.unitPrice.toFixed(2),
          taxId: line.taxId ? String(line.taxId) : "",
        }))
      : [emptyRow(0, 1)],
  );
  const [nextKey, setNextKey] = useState(Math.max(initial.lines.length, 1));

  const productsById = new Map(products.map((p) => [String(p.id), p]));
  const taxesById = new Map(taxes.map((t) => [String(t.id), t]));
  const plan = plans.find((p) => String(p.id) === planId);
  const minQuantity = plan?.minQuantity ?? 1;
  const start = parseDateInput(startDate);
  const availablePlans = plans.filter((p) => !start || isPlanAvailableOn({ ...p, active: true, ...planDates(p) }, start));
  const planUnavailable = planId !== "" && (!plan || !availablePlans.includes(plan));
  const template = templates.find((t) => String(t.id) === templateId);

  function emptyRow(key: number, quantity: number): Row {
    return { key, productId: "", variantId: "", quantity: String(quantity), unitPrice: "", taxId: "" };
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function chooseProduct(key: number, productId: string) {
    const product = productsById.get(productId);
    updateRow(key, {
      productId,
      variantId: "",
      unitPrice: product ? product.salesPrice.toFixed(2) : "",
      // Default to the product's own tax when it is still selectable.
      taxId: product?.taxId && taxesById.has(String(product.taxId)) ? String(product.taxId) : "",
    });
  }

  function chooseVariant(key: number, product: (typeof products)[number], variantId: string) {
    const variant = product.variants.find((v) => String(v.id) === variantId);
    updateRow(key, { variantId, unitPrice: round2(product.salesPrice + (variant?.extraPrice ?? 0)).toFixed(2) });
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(nextKey, minQuantity)]);
    setNextKey(nextKey + 1);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  // Copy the template's plan and lines; prices and taxes come from the catalog.
  function applyTemplate(id: string) {
    setTemplateId(id);
    const chosen = templates.find((t) => String(t.id) === id);
    if (!chosen) return;
    setPlanId(String(chosen.planId));
    if (!notes.trim() && chosen.notes) setNotes(chosen.notes);
    const templateRows = chosen.lines.flatMap((line, index) => {
      const product = productsById.get(String(line.productId));
      if (!product) return [];
      const variant = product.variants.find((v) => v.id === line.variantId);
      return [
        {
          key: nextKey + index,
          productId: String(product.id),
          variantId: variant ? String(variant.id) : "",
          quantity: String(line.quantity),
          unitPrice: round2(product.salesPrice + (variant?.extraPrice ?? 0)).toFixed(2),
          taxId: product.taxId && taxesById.has(String(product.taxId)) ? String(product.taxId) : "",
        },
      ];
    });
    const skipped = chosen.lines.length - templateRows.length;
    setRows(templateRows.length ? templateRows : [emptyRow(nextKey, 1)]);
    setNextKey(nextKey + chosen.lines.length + 1);
    toast.info(`Filled in from “${chosen.name}”`, {
      description: skipped
        ? `${skipped} line${skipped === 1 ? " was" : "s were"} skipped because the product is no longer active.`
        : "Review the customer, dates and prices, then save.",
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(
      "lines",
      JSON.stringify(
        rows.map((row) => ({
          key: row.key,
          productId: row.productId,
          variantId: row.variantId || null,
          quantity: row.quantity,
          unitPrice: row.unitPrice,
          taxId: row.taxId || null,
        })),
      ),
    );
    startTransition(async () => {
      const saved = await saveSubscription(formData);
      setResult(saved);
      if (saved.ok) {
        toast.success(isNew ? `${saved.number} saved as a draft` : `${saved.number} updated`);
        router.push(`/dashboard/subscriptions/${saved.id}`);
      } else {
        toast.error(saved.error);
      }
    });
  }

  const pricedLines = rows.flatMap((row) => {
    const quantity = Number(row.quantity);
    const unitPrice = Number(row.unitPrice);
    if (!productsById.has(row.productId) || !Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(unitPrice)) {
      return [];
    }
    return [{ quantity, unitPrice, taxRate: taxesById.get(row.taxId)?.rate ?? 0 }];
  });
  const totals = subscriptionTotals(plan?.price ?? 0, pricedLines);
  const fieldErrors = (result && !result.ok && result.fieldErrors) || {};
  const lineErrors = (result && !result.ok && result.lineErrors) || {};
  const quoteExpiry = isNew && template ? addDays(parseDateInput(today)!, template.validityDays) : null;
  const periodUnit = plan ? PERIOD_UNIT[plan.billingPeriod] : "period";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      {result && !result.ok && <Alert>{result.error}</Alert>}

      {isNew && templates.length > 0 && (
        <Card className="flex flex-wrap items-end gap-4 border-dashed bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Start from a template</h2>
              <p className="text-xs text-muted-foreground">Copies the plan and product lines and sets the quotation validity.</p>
            </div>
          </div>
          <div className="min-w-64 flex-1">
            <Field
              label="Quotation template"
              error={fieldErrors.templateId}
              hint={quoteExpiry ? `Quotation valid until ${formatDay(quoteExpiry)} (${template!.validityDays} days).` : undefined}
            >
              <Select name="templateId" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">No template — start from scratch</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} · valid {t.validityDays} day{t.validityDays === 1 ? "" : "s"}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Customer" error={fieldErrors.customerId} hint="An existing customer account.">
            <CustomerPicker
              value={customer}
              onChange={setCustomer}
              initialOptions={initialCustomers}
              invalid={!!fieldErrors.customerId}
            />
          </Field>
          <Field
            label="Plan"
            error={fieldErrors.planId}
            hint={
              plan
                ? `${PERIOD_LABEL[plan.billingPeriod]} · base fee ${formatMoney(plan.price)} · min. quantity ${plan.minQuantity} per line`
                : "Only plans on sale on the start date are listed."
            }
          >
            <Select
              name="planId"
              required
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              aria-invalid={!!fieldErrors.planId || planUnavailable || undefined}
            >
              <option value="">Choose a plan…</option>
              {planUnavailable && (
                <option value={planId} disabled>
                  {plan ? `${plan.name} — not available on this start date` : UNAVAILABLE}
                </option>
              )}
              {availablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMoney(p.price)} / {PERIOD_UNIT[p.billingPeriod]})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start date" error={fieldErrors.startDate}>
              <Input
                name="startDate"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </Field>
            <Field label="Expiry date" error={fieldErrors.expiryDate} hint="Optional. Leave empty to renew until closed.">
              <Input
                name="expiryDate"
                type="date"
                min={startDate || undefined}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Payment terms (days)"
            error={fieldErrors.paymentTermDays}
            hint={`Invoices are due ${
              Number(paymentTermDays) > 0 ? `${paymentTermsLabel(Number(paymentTermDays))} after the invoice date` : "immediately"
            }.`}
          >
            <div className="flex gap-2">
              <Input
                name="paymentTermDays"
                type="number"
                required
                min={0}
                max={365}
                step={1}
                className="w-24"
                value={paymentTermDays}
                onChange={(e) => setPaymentTermDays(e.target.value)}
              />
              <div className="flex flex-wrap gap-1">
                {PAYMENT_TERM_PRESETS.map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setPaymentTermDays(String(days))}
                    className={cx(
                      "h-9 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-accent",
                      paymentTermDays === String(days) && "border-primary bg-primary/10 text-primary",
                    )}
                  >
                    {paymentTermsLabel(days)}
                  </button>
                ))}
              </div>
            </div>
          </Field>
          <div className="md:col-span-2">
            <Field label="Notes" error={fieldErrors.notes} hint="Optional. Terms or remarks for the customer.">
              <Textarea name="notes" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Product lines</h2>
            <p className="text-sm text-muted-foreground">Prices are per billing period and exclude tax.</p>
          </div>
          <Button type="button" variant="secondary" onClick={addRow} disabled={products.length === 0}>
            <Plus className="size-4" aria-hidden /> Add line
          </Button>
        </div>

        {fieldErrors.lines && <Alert>{fieldErrors.lines}</Alert>}

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No product lines yet. Use “Add line” to add what the customer subscribes to.
          </p>
        ) : (
          <div className="space-y-3">
            <div
              className={cx(
                "hidden gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid",
                GRID,
              )}
            >
              <span>Product</span>
              <span>Variant</span>
              <span>Qty</span>
              <span>Unit price</span>
              <span>Tax</span>
              <span className="text-right">Amount</span>
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, index) => {
              const product = productsById.get(row.productId);
              const productMissing = row.productId !== "" && !product;
              const variants = product?.variants ?? [];
              const variant = variants.find((v) => String(v.id) === row.variantId);
              const variantMissing = row.variantId !== "" && !!product && !variant;
              const taxMissing = row.taxId !== "" && !taxesById.has(row.taxId);
              const quantity = Number(row.quantity);
              const unitPrice = Number(row.unitPrice);
              const amount =
                product && Number.isFinite(quantity) && quantity >= 0 && Number.isFinite(unitPrice)
                  ? lineSubtotal({ quantity, unitPrice })
                  : null;
              const error = lineErrors[String(row.key)];

              return (
                <div key={row.key} className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div
                    className={cx(
                      "grid gap-3 rounded-lg p-1 md:items-center",
                      GRID,
                      error && "bg-destructive/5 ring-1 ring-destructive/30",
                    )}
                  >
                    <Select
                      aria-label={`Line ${index + 1} product`}
                      required
                      value={row.productId}
                      onChange={(e) => chooseProduct(row.key, e.target.value)}
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
                      onChange={(e) => product && chooseVariant(row.key, product, e.target.value)}
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
                    <Input
                      aria-label={`Line ${index + 1} unit price`}
                      type="number"
                      required
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.unitPrice}
                      onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                    />
                    <Select
                      aria-label={`Line ${index + 1} tax`}
                      value={row.taxId}
                      onChange={(e) => updateRow(row.key, { taxId: e.target.value })}
                    >
                      <option value="">No tax</option>
                      {taxMissing && (
                        <option value={row.taxId} disabled>
                          {UNAVAILABLE}
                        </option>
                      )}
                      {taxes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </Select>
                    <span className="text-right text-sm tabular-nums">{amount === null ? "—" : formatMoney(amount)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="justify-self-end px-2"
                      onClick={() => removeRow(row.key)}
                      aria-label={`Remove line ${index + 1}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  {error && <p className="px-1 text-xs text-destructive">{error}</p>}
                </div>
              );
            })}
          </div>
        )}

        <dl className="ml-auto max-w-xs space-y-1.5 border-t pt-4 text-sm">
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Plan base fee</dt>
            <dd className="tabular-nums">{plan ? formatMoney(totals.baseFee) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Products</dt>
            <dd className="tabular-nums">{formatMoney(totals.productsSubtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Tax</dt>
            <dd className="tabular-nums">{formatMoney(totals.tax)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-1.5 text-base font-semibold">
            <dt>Total / {periodUnit}</dt>
            <dd className="tabular-nums">{formatMoney(totals.total)}</dd>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">Before discounts. The plan base fee is not taxed.</p>
        </dl>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href={initial.id ? `/dashboard/subscriptions/${initial.id}` : "/dashboard/subscriptions"} variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : isNew ? "Save as draft" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function planDates(plan: { startDate: string; endDate: string }) {
  return { startDate: plan.startDate || null, endDate: plan.endDate || null };
}
