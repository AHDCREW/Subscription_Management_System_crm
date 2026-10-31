"use client";

import { useActionState, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { Alert, Badge, Button, Card, Field, Input, Table, Td, Th } from "@/components/kit";
import { Button as IconButton } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { removeVariant, saveVariant, type VariantActionState } from "../actions";

export type VariantRow = {
  id: number;
  attribute: string;
  value: string;
  extraPrice: number;
  subscriptionLines: number;
  templateLines: number;
};

function extra(amount: number) {
  return `+${formatMoney(amount)}`;
}

function groupByAttribute(variants: VariantRow[]) {
  const groups = new Map<string, VariantRow[]>();
  for (const v of variants) groups.set(v.attribute, [...(groups.get(v.attribute) ?? []), v]);
  return [...groups.entries()].map(([attribute, rows]) => ({ attribute, rows }));
}

export function VariantsCard({
  productId,
  salesPrice,
  variants,
  isAdmin,
}: {
  productId: number;
  salesPrice: number;
  variants: VariantRow[];
  isAdmin: boolean;
}) {
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; variant: VariantRow } | null>(null);
  const [deleting, setDeleting] = useState<VariantRow | null>(null);
  const groups = groupByAttribute(variants);
  const attributes = groups.map((g) => g.attribute);

  return (
    <TooltipProvider>
      <Card>
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="size-4 text-muted-foreground" aria-hidden />
              Variants
              {variants.length > 0 && <Badge tone="indigo">{variants.length}</Badge>}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Line price = sales price ({formatMoney(salesPrice)}) + the variant&apos;s extra price.
            </p>
          </div>
          {isAdmin && (
            <Button type="button" onClick={() => setDialog({ mode: "add" })}>
              <Plus aria-hidden />
              Add variant
            </Button>
          )}
        </div>

        {variants.length === 0 ? (
          <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground animate-in fade-in duration-500">
            {isAdmin
              ? "No variants yet. Add one, e.g. Brand: Odoo with an extra price of 560."
              : "This product has no variants."}
          </div>
        ) : (
          <>
            <ul className="mb-4 space-y-1.5 text-sm">
              {groups.map((g) => (
                <li key={g.attribute} className="animate-in fade-in duration-500">
                  <span className="font-medium">{g.attribute}:</span>{" "}
                  <span className="text-muted-foreground">
                    {g.rows.map((v) => `${v.value} ${extra(v.extraPrice)}`).join(", ")}
                  </span>
                </li>
              ))}
            </ul>

            <Table>
              <thead>
                <tr>
                  <Th>Attribute</Th>
                  <Th>Value</Th>
                  <Th className="text-right">Extra price</Th>
                  <Th className="text-right">Line price</Th>
                  <Th className="text-right">Used on</Th>
                  {isAdmin && (
                    <Th className="w-0">
                      <span className="sr-only">Actions</span>
                    </Th>
                  )}
                </tr>
              </thead>
              {groups.map((g) => (
                <tbody key={g.attribute}>
                  <tr>
                    <td colSpan={isAdmin ? 6 : 5} className="border-t bg-muted/30 px-4 py-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {g.attribute} · {g.rows.length} {g.rows.length === 1 ? "value" : "values"}
                    </td>
                  </tr>
                  {g.rows.map((v) => {
                    const used = v.subscriptionLines + v.templateLines;
                    return (
                      <tr
                        key={v.id}
                        className="transition-colors hover:bg-muted/40 animate-in fade-in slide-in-from-top-1 duration-500"
                      >
                        <Td className="text-muted-foreground">{v.attribute}</Td>
                        <Td className="font-medium">{v.value}</Td>
                        <Td className="text-right tabular-nums">{extra(v.extraPrice)}</Td>
                        <Td className="text-right font-medium tabular-nums">{formatMoney(salesPrice + v.extraPrice)}</Td>
                        <Td className="text-right tabular-nums">
                          {used === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="cursor-default underline decoration-dotted underline-offset-4">
                                  {used} {used === 1 ? "line" : "lines"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                {v.subscriptionLines} subscription · {v.templateLines} template
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </Td>
                        {isAdmin && (
                          <Td className="py-1.5">
                            <div className="flex justify-end gap-1">
                              <RowAction label={`Edit ${v.attribute}: ${v.value}`} onClick={() => setDialog({ mode: "edit", variant: v })}>
                                <Pencil />
                              </RowAction>
                              <RowAction label={`Delete ${v.attribute}: ${v.value}`} onClick={() => setDeleting(v)} danger>
                                <Trash2 />
                              </RowAction>
                            </div>
                          </Td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </Table>
          </>
        )}
      </Card>

      {isAdmin && (
        <>
          <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
            <DialogContent className="sm:max-w-md">
              {dialog && (
                <VariantForm
                  key={dialog.mode === "edit" ? dialog.variant.id : "new"}
                  productId={productId}
                  salesPrice={salesPrice}
                  attributes={attributes}
                  variant={dialog.mode === "edit" ? dialog.variant : undefined}
                  onDone={() => setDialog(null)}
                />
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
            <DialogContent className="sm:max-w-md">
              {deleting && (
                <DeleteVariant key={deleting.id} productId={productId} variant={deleting} onDone={() => setDeleting(null)} />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </TooltipProvider>
  );
}

function RowAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          className={danger ? "text-muted-foreground hover:text-destructive" : "text-muted-foreground"}
        >
          {children}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function VariantForm({
  productId,
  salesPrice,
  attributes,
  variant,
  onDone,
}: {
  productId: number;
  salesPrice: number;
  attributes: string[];
  variant?: VariantRow;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(async (prev: VariantActionState, formData: FormData) => {
    const result = await saveVariant(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const initial = {
    attribute: variant?.attribute ?? attributes[0] ?? "",
    value: variant?.value ?? "",
    extraPrice: variant ? variant.extraPrice.toFixed(2) : "",
  };
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};
  const [preview, setPreview] = useState(values.extraPrice);
  const previewAmount = Number(preview.replace(/,/g, ""));
  const used = variant ? variant.subscriptionLines + variant.templateLines : 0;

  return (
    <form key={JSON.stringify(state?.values ?? null)} action={action} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{variant ? "Edit variant" : "Add variant"}</DialogTitle>
        <DialogDescription>
          A variant adds an extra price on top of the product, e.g. Brand: Odoo adds ₹560.
        </DialogDescription>
      </DialogHeader>

      <input type="hidden" name="productId" value={productId} />
      {variant && <input type="hidden" name="variantId" value={variant.id} />}
      {state?.error && <Alert>{state.error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Attribute" error={errors.attribute}>
          <Input
            name="attribute"
            list="variant-attributes"
            required
            maxLength={80}
            defaultValue={values.attribute}
            placeholder="e.g. Brand"
            aria-invalid={Boolean(errors.attribute)}
            autoFocus={!values.attribute}
          />
        </Field>
        <Field label="Value" error={errors.value}>
          <Input
            name="value"
            required
            maxLength={80}
            defaultValue={values.value}
            placeholder="e.g. Odoo"
            aria-invalid={Boolean(errors.value)}
            autoFocus={Boolean(values.attribute)}
          />
        </Field>
      </div>
      <datalist id="variant-attributes">
        {attributes.map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>

      <Field
        label="Extra price (₹)"
        hint={
          Number.isFinite(previewAmount) && previewAmount >= 0
            ? `Line price: ${formatMoney(salesPrice + previewAmount)}`
            : "Added to the sales price. Use 0 for the base option."
        }
        error={errors.extraPrice}
      >
        <Input
          name="extraPrice"
          inputMode="decimal"
          defaultValue={values.extraPrice}
          placeholder="0.00"
          aria-invalid={Boolean(errors.extraPrice)}
          onChange={(e) => setPreview(e.target.value)}
        />
      </Field>

      {used > 0 && (
        <p className="text-xs text-muted-foreground">
          Used on {used} {used === 1 ? "line" : "lines"}. Existing subscription lines keep the price they were sold at.
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : variant ? "Save changes" : "Add variant"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteVariant({ productId, variant, onDone }: { productId: number; variant: VariantRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: VariantActionState, formData: FormData) => {
    const result = await removeVariant(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const name = `${variant.attribute}: ${variant.value}`;
  const used = variant.subscriptionLines + variant.templateLines;

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Delete {name}?</DialogTitle>
        <DialogDescription>
          {used > 0
            ? "This variant is still in use, so it can't be deleted."
            : "It will no longer be offered on new subscriptions or templates. This can't be undone."}
        </DialogDescription>
      </DialogHeader>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="variantId" value={variant.id} />

      {used > 0 && !state?.error && (
        <Alert>
          Used on {variant.subscriptionLines} subscription {variant.subscriptionLines === 1 ? "line" : "lines"} and{" "}
          {variant.templateLines} template {variant.templateLines === 1 ? "line" : "lines"}. Remove it from those lines first.
        </Alert>
      )}
      {state?.error && <Alert>{state.error}</Alert>}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="danger" disabled={pending || used > 0}>
          {pending ? "Deleting…" : "Delete variant"}
        </Button>
      </DialogFooter>
    </form>
  );
}
