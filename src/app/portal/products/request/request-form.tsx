"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, Trash2 } from "lucide-react";
import { Alert, Button, ButtonLink, Card, Field, Input, Select, Textarea, cx } from "@/components/kit";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT, estimateRecurringTotal, lineAmount, lineUnitPrice } from "@/lib/subscriptions/templates";
import { formatDay, isPlanAvailableOn, parseDateInput } from "@/lib/subscriptions/subscriptions";
import { REQUEST_MAX_LINES } from "@/lib/subscriptions/quote-requests";
import { requestQuotation, type RequestQuotationResult } from "../actions";
import type { CatalogTemplate, RequestCatalog } from "../data";

type Row = { key: number; productId: string; variantId: string; quantity: string };

const GRID = "md:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_5.5rem_7.5rem_7rem_2.25rem]";

// The customer picks a plan and products; prices shown are an estimate from the
// catalog. The server prices the request again and never trusts these numbers.
export function RequestForm({
  catalog,
  initialTemplateId,
  today,
  requestsLeft,
}: {
  catalog: RequestCatalog;
  initialTemplateId: number | null;
  today: string;
  requestsLeft: number;
}) {
  const { plans, products, templates } = catalog;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<RequestQuotationResult | null>(null);

  const productsById = new Map(products.map((p) => [String(p.id), p]));
  const initialTemplate = templates.find((t) => t.id === initialTemplateId);

  const [templateId, setTemplateId] = useState(initialTemplate ? String(initialTemplate.id) : "");
  const [planId, setPlanId] = useState(initialTemplate ? String(initialTemplate.planId) : "");
  const [startDate, setStartDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(() => (initialTemplate ? templateRows(initialTemplate, 0) : [emptyRow(0, 1)]));
  const [nextKey, setNextKey] = useState(initialTemplate ? initialTemplate.lines.length + 1 : 1);

  const plan = plans.find((p) => String(p.id) === planId);
  const minQuantity = plan?.minQuantity ?? 1;
  const start = parseDateInput(startDate);
  // Every plan listed is on sale today; one with an end date may not cover a later start.
  const endsBeforeStart =
    !!plan && !!start && !isPlanAvailableOn({ active: true, startDate: null, endDate: plan.endDate || null }, start);

  function emptyRow(key: number, quantity: number): Row {
    return { key, productId: "", variantId: "", quantity: String(quantity) };
  }

  function templateRows(template: CatalogTemplate, firstKey: number): Row[] {
    const filled = template.lines.flatMap((line, index) => {
      const product = productsById.get(String(line.productId));
      if (!product) return [];
      const variant = product.variants.find((v) => v.id === line.variantId);
      return [
        {
          key: firstKey + index,
          productId: String(product.id),
          variantId: variant ? String(variant.id) : "",
          quantity: String(line.quantity),
        },
      ];
    });
    return filled.length ? filled : [emptyRow(firstKey, 1)];
  }

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(nextKey, minQuantity)]);
    setNextKey(nextKey + 1);
  }

  function removeRow(key: number) {
    setRows((current) => current.filter((row) => row.key !== key));
  }

  // Copy the package's plan and lines. Choosing "build my own" keeps what is there.
  function applyTemplate(id: string) {
    setTemplateId(id);
    const chosen = templates.find((t) => String(t.id) === id);
    if (!chosen) return;
    setPlanId(String(chosen.planId));
    setRows(templateRows(chosen, nextKey));
    setNextKey(nextKey + chosen.lines.length + 1);
    toast.info(`Filled in from “${chosen.name}”`, { description: "Change the plan, products or quantities as you like." });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set(
      "lines",
      JSON.stringify(
        rows.map((row) => ({ key: row.key, productId: row.productId, variantId: row.variantId || null, quantity: row.quantity })),
      ),
    );
    startTransition(async () => {
      const saved = await requestQuotation(formData);
      setResult(saved);
      if (saved.ok) {
        toast.success(`Request ${saved.number} sent`, { description: "Our team will review it and send you a quotation." });
        router.push(`/portal/subscriptions/${saved.id}`);
      } else {
        toast.error(saved.error);
      }
    });
  }

  const pricedLines = rows.flatMap((row) => {
    const product = productsById.get(row.productId);
    const quantity = Number(row.quantity);
    if (!product || !Number.isFinite(quantity) || quantity < 0) return [];
    const variant = product.variants.find((v) => String(v.id) === row.variantId);
    return [{ quantity, salesPrice: product.salesPrice, extraPrice: variant?.extraPrice }];
  });
  const baseFee = plan?.price ?? 0;
  const productsTotal = estimateRecurringTotal(0, pricedLines);
  const estimate = estimateRecurringTotal(baseFee, pricedLines);
  const fieldErrors = (result && !result.ok && result.fieldErrors) || {};
  const lineErrors = (result && !result.ok && result.lineErrors) || {};
  const periodUnit = plan ? PERIOD_UNIT[plan.billingPeriod] : "period";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {result && !result.ok && <Alert>{result.error}</Alert>}

      {templates.length > 0 && (
        <Card className="flex flex-wrap items-end gap-4 border-dashed bg-muted/30">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <FileText className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="text-base font-semibold">Start from a package</h2>
              <p className="text-xs text-muted-foreground">Fills in the plan and products. You can change them after.</p>
            </div>
          </div>
          <div className="min-w-64 flex-1">
            <Field label="Ready-made package" error={fieldErrors.templateId}>
              <Select name="templateId" value={templateId} onChange={(e) => applyTemplate(e.target.value)}>
                <option value="">No package — build my own</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      <Card className="space-y-4">
        <h2 className="text-base font-semibold">Plan and start date</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Plan"
            error={fieldErrors.planId}
            hint={
              plan
                ? `${PERIOD_LABEL[plan.billingPeriod]} · base fee ${formatMoney(plan.price)} · at least ${plan.minQuantity} of each product`
                : "How often you're billed, and its base fee."
            }
          >
            <Select name="planId" required value={planId} onChange={(e) => setPlanId(e.target.value)} aria-invalid={!!fieldErrors.planId || undefined}>
              <option value="">Choose a plan…</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({formatMoney(p.price)} / {PERIOD_UNIT[p.billingPeriod]})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Preferred start date"
            error={fieldErrors.startDate ?? (endsBeforeStart ? `${plan!.name} is on sale until ${formatDay(parseDateInput(plan!.endDate))}.` : undefined)}
            hint="We'll confirm the exact date in your quotation."
          >
            <Input
              name="startDate"
              type="date"
              required
              min={today}
              max={plan?.endDate || undefined}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-invalid={!!fieldErrors.startDate || endsBeforeStart || undefined}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Note for our team" error={fieldErrors.notes} hint="Optional. Anything we should know, like the number of users or a budget.">
              <Textarea name="notes" maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Products</h2>
            <p className="text-sm text-muted-foreground">Billed every {periodUnit} on top of the plan&apos;s base fee.</p>
          </div>
          <Button type="button" variant="secondary" onClick={addRow} disabled={rows.length >= REQUEST_MAX_LINES}>
            <Plus className="size-4" aria-hidden /> Add product
          </Button>
        </div>

        {fieldErrors.lines && <Alert>{fieldErrors.lines}</Alert>}

        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No products yet. Use “Add product” to choose what you need.
          </p>
        ) : (
          <div className="space-y-3">
            <div className={cx("hidden gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid", GRID)}>
              <span>Product</span>
              <span>Variant</span>
              <span>Qty</span>
              <span className="text-right">Unit price</span>
              <span className="text-right">Amount</span>
              <span className="sr-only">Remove</span>
            </div>
            {rows.map((row, index) => {
              const product = productsById.get(row.productId);
              const variants = product?.variants ?? [];
              const variant = variants.find((v) => String(v.id) === row.variantId);
              const quantity = Number(row.quantity);
              const unitPrice = product ? lineUnitPrice(product.salesPrice, variant?.extraPrice) : null;
              const amount =
                product && Number.isFinite(quantity) && quantity >= 0
                  ? lineAmount({ quantity, salesPrice: product.salesPrice, extraPrice: variant?.extraPrice })
                  : null;
              const error = lineErrors[String(row.key)];

              return (
                <div key={row.key} className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className={cx("grid gap-3 rounded-lg p-1 md:items-center", GRID, error && "bg-destructive/5 ring-1 ring-destructive/30")}>
                    <Select
                      aria-label={`Line ${index + 1} product`}
                      required
                      value={row.productId}
                      onChange={(e) => updateRow(row.key, { productId: e.target.value, variantId: "" })}
                    >
                      <option value="">Choose a product…</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({formatMoney(p.salesPrice)})
                        </option>
                      ))}
                    </Select>
                    <Select
                      aria-label={`Line ${index + 1} variant`}
                      value={row.variantId}
                      disabled={!product || variants.length === 0}
                      onChange={(e) => updateRow(row.key, { variantId: e.target.value })}
                    >
                      <option value="">{product && variants.length === 0 ? "No variants" : "No variant"}</option>
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
                    <span className="text-right text-sm tabular-nums text-muted-foreground">
                      {unitPrice === null ? "—" : formatMoney(unitPrice)}
                    </span>
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
            <dd className="tabular-nums">{plan ? formatMoney(baseFee) : "—"}</dd>
          </div>
          <div className="flex justify-between gap-4 text-muted-foreground">
            <dt>Products</dt>
            <dd className="tabular-nums">{formatMoney(productsTotal)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t pt-1.5 text-base font-semibold">
            <dt>Estimate / {periodUnit}</dt>
            <dd className="tabular-nums">{formatMoney(estimate)}</dd>
          </div>
          <p className="pt-1 text-xs text-muted-foreground">Plus tax. Your quotation confirms the final prices.</p>
        </dl>
      </Card>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-auto text-xs text-muted-foreground">
          You can have {requestsLeft} more request{requestsLeft === 1 ? "" : "s"} open with our team.
        </p>
        <ButtonLink href="/portal/products" variant="ghost">
          Cancel
        </ButtonLink>
        <Button type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send request"}
        </Button>
      </div>
    </form>
  );
}
