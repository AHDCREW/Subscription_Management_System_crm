"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { CreditCard, Loader2, Lock, Smartphone } from "lucide-react";
import { Alert, Badge, Button, Card, Field, Input } from "@/components/kit";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatMoney } from "@/lib/money";
import {
  DEMO_CARD_SUCCESS,
  DEMO_UPI_FAILURE,
  DEMO_UPI_SUCCESS,
  digitsOnly,
  formatCardNumber,
  validateDemoPay,
  type DemoPayFieldErrors,
  type DemoPayInput,
  type DemoPayMethod,
} from "@/lib/billing/demo-pay";
import { payInvoiceDemo } from "./actions";

const PROCESSING_MS = 1500;

function formatExpiry(value: string) {
  const digits = digitsOnly(value).slice(0, 4);
  return digits.length > 2 ? `${digits.slice(0, 2)} / ${digits.slice(2)}` : digits;
}

function TestHint({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-md border border-dashed bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">Test mode.</span> {children}
    </p>
  );
}

export function CheckoutForm({
  invoiceId,
  invoiceNumber,
  companyName,
  amount,
  customerName,
}: {
  invoiceId: number;
  invoiceNumber: string;
  companyName: string;
  amount: number;
  customerName: string;
}) {
  const [method, setMethod] = useState<DemoPayMethod>("CARD");
  const [card, setCard] = useState({ cardNumber: DEMO_CARD_SUCCESS, expiry: "12 / 30", cvc: "123", name: customerName });
  const [upiId, setUpiId] = useState(DEMO_UPI_SUCCESS);
  const [fieldErrors, setFieldErrors] = useState<DemoPayFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [processing, startTransition] = useTransition();
  const amountLabel = formatMoney(amount);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input: DemoPayInput = { method, ...card, upiId };
    const errors = validateDemoPay(input);
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    startTransition(async () => {
      await new Promise((resolve) => setTimeout(resolve, PROCESSING_MS));
      // Success redirects to the receipt; anything returned is a decline or a problem.
      const result = await payInvoiceDemo(invoiceId, input, amount);
      if (result) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.error ?? null);
      }
    });
  }

  return (
    <Card className="p-0">
      <div className="space-y-1 border-b p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{companyName}</p>
          <Badge tone="outline">Demo mode</Badge>
        </div>
        <h1 className="text-base font-semibold">Invoice {invoiceNumber}</h1>
        <p className="pt-2 text-xs text-muted-foreground">Amount due</p>
        <p className="text-2xl font-semibold tracking-tight tabular-nums">{amountLabel}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 p-6" noValidate>
        {error && <Alert>{error}</Alert>}
        <fieldset disabled={processing} className="space-y-4">
          <legend className="sr-only">Payment method</legend>
          <Tabs value={method} onValueChange={(value) => { setMethod(value as DemoPayMethod); setFieldErrors({}); setError(null); }}>
            <TabsList className="w-full">
              <TabsTrigger value="CARD">
                <CreditCard aria-hidden /> Card
              </TabsTrigger>
              <TabsTrigger value="UPI">
                <Smartphone aria-hidden /> UPI
              </TabsTrigger>
            </TabsList>

            <TabsContent value="CARD" className="space-y-4 pt-2">
              <Field label="Card number" error={fieldErrors.cardNumber}>
                <Input
                  inputMode="numeric"
                  autoComplete="cc-number"
                  value={card.cardNumber}
                  onChange={(e) => setCard({ ...card, cardNumber: formatCardNumber(e.target.value) })}
                  aria-invalid={Boolean(fieldErrors.cardNumber)}
                  className="tabular-nums"
                />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Expiry" error={fieldErrors.expiry}>
                  <Input
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    placeholder="MM / YY"
                    value={card.expiry}
                    onChange={(e) => setCard({ ...card, expiry: formatExpiry(e.target.value) })}
                    aria-invalid={Boolean(fieldErrors.expiry)}
                    className="tabular-nums"
                  />
                </Field>
                <Field label="CVC" error={fieldErrors.cvc}>
                  <Input
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    maxLength={4}
                    value={card.cvc}
                    onChange={(e) => setCard({ ...card, cvc: digitsOnly(e.target.value).slice(0, 4) })}
                    aria-invalid={Boolean(fieldErrors.cvc)}
                    className="tabular-nums"
                  />
                </Field>
              </div>
              <Field label="Name on card" error={fieldErrors.name}>
                <Input
                  autoComplete="cc-name"
                  maxLength={80}
                  value={card.name}
                  onChange={(e) => setCard({ ...card, name: e.target.value })}
                  aria-invalid={Boolean(fieldErrors.name)}
                />
              </Field>
              <TestHint>
                Use {DEMO_CARD_SUCCESS} with any future expiry and CVC. A card ending 0002 is declined.
              </TestHint>
            </TabsContent>

            <TabsContent value="UPI" className="space-y-4 pt-2">
              <Field label="UPI ID" error={fieldErrors.upiId}>
                <Input
                  autoComplete="off"
                  maxLength={100}
                  placeholder="name@bank"
                  value={upiId}
                  onChange={(e) => setUpiId(e.target.value)}
                  aria-invalid={Boolean(fieldErrors.upiId)}
                />
              </Field>
              <TestHint>
                Use {DEMO_UPI_SUCCESS} to pay, or {DEMO_UPI_FAILURE} to see a failed payment.
              </TestHint>
            </TabsContent>
          </Tabs>
        </fieldset>

        <Button type="submit" className="w-full" disabled={processing}>
          {processing ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden /> Processing…
            </>
          ) : (
            <>Pay {amountLabel}</>
          )}
        </Button>
        <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="size-3.5" aria-hidden /> Demo mode — no real money moves.
        </p>
      </form>
    </Card>
  );
}
