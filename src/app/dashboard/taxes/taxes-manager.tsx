"use client";

import { useActionState, useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Checkbox, EmptyState, Field, Input, PageHeader, Table, Td, Th } from "@/components/kit";
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
import { deleteTax, saveTax, setTaxActive, type TaxActionState } from "./actions";

export type TaxRow = {
  id: number;
  name: string;
  rate: number;
  active: boolean;
  products: number;
  subscriptionLines: number;
};

function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function report(result: TaxActionState) {
  if (result?.ok) toast.success(result.message);
  else if (result?.error) toast.error(result.error);
}

export function TaxesManager({ taxes }: { taxes: TaxRow[] }) {
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; tax: TaxRow } | null>(null);
  const [deleting, setDeleting] = useState<TaxRow | null>(null);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  const toggle = (tax: TaxRow) => {
    const formData = new FormData();
    formData.set("id", String(tax.id));
    formData.set("active", String(!tax.active));
    setTogglingId(tax.id);
    startTransition(async () => {
      report(await setTaxActive(formData));
      setTogglingId(null);
    });
  };

  const newTax = (label: string) => (
    <Button type="button" onClick={() => setDialog({ mode: "add" })}>
      <Plus aria-hidden />
      {label}
    </Button>
  );

  return (
    <TooltipProvider>
      <PageHeader
        title="Taxes"
        description="Tax rules applied automatically to subscription lines and invoices."
        actions={taxes.length > 0 && newTax("New tax")}
      />

      {taxes.length === 0 ? (
        <EmptyState message="No tax rules yet." action={newTax("Add your first tax")} />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th className="text-right">Rate</Th>
              <Th>Status</Th>
              <Th className="text-right">Products</Th>
              <Th className="w-0">
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {taxes.map((t) => {
              const unused = t.products === 0 && t.subscriptionLines === 0;
              return (
                <tr key={t.id} className="transition-colors hover:bg-muted/40">
                  <Td className="font-medium">{t.name}</Td>
                  <Td className="text-right tabular-nums">{t.rate}%</Td>
                  <Td>{t.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}</Td>
                  <Td className="text-right tabular-nums">
                    {t.products === 0 ? <span className="text-muted-foreground">—</span> : t.products}
                  </Td>
                  <Td className="py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      <IconButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground"
                        disabled={togglingId === t.id}
                        onClick={() => toggle(t)}
                      >
                        {t.active ? "Deactivate" : "Activate"}
                      </IconButton>
                      <RowAction label={`Edit ${t.name}`} onClick={() => setDialog({ mode: "edit", tax: t })}>
                        <Pencil />
                      </RowAction>
                      {unused && (
                        <RowAction label={`Delete ${t.name}`} onClick={() => setDeleting(t)} danger>
                          <Trash2 />
                        </RowAction>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          {dialog && (
            <TaxForm
              key={dialog.mode === "edit" ? dialog.tax.id : "new"}
              tax={dialog.mode === "edit" ? dialog.tax : undefined}
              onDone={() => setDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          {deleting && <DeleteTax key={deleting.id} tax={deleting} onDone={() => setDeleting(null)} />}
        </DialogContent>
      </Dialog>
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

function TaxForm({ tax, onDone }: { tax?: TaxRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: TaxActionState, formData: FormData) => {
    const result = await saveTax(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const initial = { name: tax?.name ?? "", rate: tax ? String(tax.rate) : "", active: tax?.active ?? true };
  const values = state?.values ?? initial;
  const errors = state?.fieldErrors ?? {};
  const used = tax ? tax.products + tax.subscriptionLines : 0;

  return (
    <form key={JSON.stringify(state?.values ?? null)} action={action} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{tax ? "Edit tax" : "New tax"}</DialogTitle>
        <DialogDescription>A percent added on top of the line amount, e.g. GST 18%.</DialogDescription>
      </DialogHeader>

      {tax && <input type="hidden" name="id" value={tax.id} />}
      {state?.error && <Alert>{state.error}</Alert>}

      <Field label="Name" error={errors.name}>
        <Input
          name="name"
          required
          maxLength={80}
          defaultValue={values.name}
          placeholder="e.g. GST 18%"
          aria-invalid={Boolean(errors.name)}
          autoFocus
        />
      </Field>

      <Field label="Rate (%)" hint="Between 0 and 100, up to 2 decimals." error={errors.rate}>
        <Input
          name="rate"
          inputMode="decimal"
          required
          defaultValue={values.rate}
          placeholder="18"
          aria-invalid={Boolean(errors.rate)}
        />
      </Field>

      <Checkbox name="active" label="Active (can be chosen for products and new lines)" defaultChecked={values.active} />

      {used > 0 && (
        <p className="text-xs text-muted-foreground">
          Used by {plural(tax?.products ?? 0, "product")} and {plural(tax?.subscriptionLines ?? 0, "subscription line")}.
          Invoices already issued keep the rate they were billed at.
        </p>
      )}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : tax ? "Save changes" : "Add tax"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteTax({ tax, onDone }: { tax: TaxRow; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (_prev: TaxActionState, formData: FormData) => {
    const result = await deleteTax(formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  return (
    <form action={action} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Delete {tax.name}?</DialogTitle>
        <DialogDescription>No products or subscription lines use this tax. This can&apos;t be undone.</DialogDescription>
      </DialogHeader>
      <input type="hidden" name="id" value={tax.id} />
      {state?.error && <Alert>{state.error}</Alert>}

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting…" : "Delete tax"}
        </Button>
      </DialogFooter>
    </form>
  );
}
