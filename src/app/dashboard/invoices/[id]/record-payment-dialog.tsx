"use client";

import { useActionState, useState } from "react";
import { Banknote } from "lucide-react";
import { toast } from "sonner";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/kit";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { localIsoDate, MANUAL_PAYMENT_METHODS, PAYMENT_METHOD_LABELS, PAYMENT_NOTE_MAX } from "@/lib/billing/payment";
import { recordInvoicePayment, type RecordPaymentState } from "../actions";

export function RecordPaymentDialog({
  invoiceId,
  number,
  balance,
  balanceLabel,
}: {
  invoiceId: number;
  number: string;
  balance: number;
  balanceLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button">
          <Banknote className="size-4" aria-hidden /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {/* Mounted only while open, so each opening starts from the current balance and today's date. */}
        {open && (
          <RecordPaymentForm
            invoiceId={invoiceId}
            number={number}
            balance={balance}
            balanceLabel={balanceLabel}
            onDone={() => setOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentForm({
  invoiceId,
  number,
  balance,
  balanceLabel,
  onDone,
}: {
  invoiceId: number;
  number: string;
  balance: number;
  balanceLabel: string;
  onDone: () => void;
}) {
  const today = localIsoDate();
  const [values, setValues] = useState({ method: "BANK_TRANSFER", amount: balance.toFixed(2), date: today, note: "" });
  const set = (name: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((prev) => ({ ...prev, [name]: event.target.value }));

  const [state, action, pending] = useActionState(async (_prev: RecordPaymentState, formData: FormData) => {
    try {
      const result = await recordInvoicePayment(invoiceId, formData);
      if (result?.ok) {
        toast.success(result.message, { description: number });
        onDone();
      }
      return result;
    } catch {
      return { ok: false as const, error: "Something went wrong. Please try again." };
    }
  }, undefined);

  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const error = state && !state.ok ? state.error : undefined;

  return (
    <form action={action} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>
          Against {number}. Balance due {balanceLabel}.
        </DialogDescription>
      </DialogHeader>

      {error && <Alert>{error}</Alert>}

      <Field label="Method" error={errors.method}>
        <Select name="method" value={values.method} onChange={set("method")} aria-invalid={Boolean(errors.method)}>
          {MANUAL_PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {PAYMENT_METHOD_LABELS[method]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" hint="Up to the balance due." error={errors.amount}>
          <Input
            name="amount"
            type="number"
            inputMode="decimal"
            min="0.01"
            max={balance.toFixed(2)}
            step="0.01"
            value={values.amount}
            onChange={set("amount")}
            className="tabular-nums"
            aria-invalid={Boolean(errors.amount)}
            autoFocus
          />
        </Field>
        <Field label="Payment date" error={errors.date}>
          <Input
            name="date"
            type="date"
            max={today}
            value={values.date}
            onChange={set("date")}
            aria-invalid={Boolean(errors.date)}
          />
        </Field>
      </div>

      <Field label="Note" hint="Optional. Cheque number, transaction id or anything useful." error={errors.note}>
        <Textarea
          name="note"
          maxLength={PAYMENT_NOTE_MAX}
          value={values.note}
          onChange={set("note")}
          aria-invalid={Boolean(errors.note)}
        />
      </Field>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={pending}>
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Recording…" : "Record payment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
