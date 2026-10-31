import type { SubscriptionStatus } from "@prisma/client";
import { Check, Pause } from "lucide-react";
import { Badge, cx } from "@/components/kit";
import { STATUS_INFO, STATUS_STEPS } from "@/lib/subscriptions/subscriptions";
import { REQUESTED_STATUS } from "@/lib/subscriptions/quote-requests";

// `requested` shows a customer their own open request as "Requested" instead of "Draft".
export function StatusBadge({ status, requested = false }: { status: SubscriptionStatus; requested?: boolean }) {
  const info = requested && status === "DRAFT" ? REQUESTED_STATUS : STATUS_INFO[status];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

// Draft → Quotation → Confirmed → Active → Closed. Paused shows on the Active step,
// and a customer's own request on the Draft step as "Requested".
export function StatusStepper({ status, requested = false }: { status: SubscriptionStatus; requested?: boolean }) {
  const current = STATUS_STEPS.indexOf(status === "PAUSED" ? "ACTIVE" : status);

  return (
    <ol className="flex w-full items-start" aria-label="Subscription status">
      {STATUS_STEPS.map((step, index) => {
        const done = index < current || (status === "CLOSED" && index === current);
        const isCurrent = index === current;
        const paused = isCurrent && status === "PAUSED";
        const label = paused
          ? STATUS_INFO.PAUSED.label
          : requested && step === "DRAFT"
            ? REQUESTED_STATUS.label
            : STATUS_INFO[step].label;
        return (
          <li
            key={step}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-1 flex-col items-center gap-2 text-center animate-in fade-in slide-in-from-bottom-1 fill-mode-both duration-500"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {index > 0 && (
              <span
                aria-hidden
                className={cx(
                  // Runs between the previous circle and this one, never under them.
                  "absolute top-4 right-[calc(50%+1.25rem)] left-[calc(-50%+1.25rem)] h-0.5 -translate-y-1/2 rounded-full",
                  index <= current ? "bg-primary" : "bg-border",
                )}
              />
            )}
            <span
              className={cx(
                "relative z-10 flex size-8 items-center justify-center rounded-full border-2 text-xs font-semibold transition-all duration-500",
                done && "border-primary bg-primary text-primary-foreground",
                isCurrent && !done && "border-primary bg-background text-primary ring-4 ring-primary/15",
                !done && !isCurrent && "border-border bg-background text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : paused ? <Pause className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={cx("text-xs font-medium", isCurrent ? "text-foreground" : "text-muted-foreground")}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
