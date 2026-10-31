"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, SectionHeader, cx } from "@/components/kit";
import { setMyAddon } from "../addons-actions";

export type AddonOption = {
  id: number;
  name: string;
  // Preformatted, e.g. "₹199.00 / month".
  price: string;
  tax: string | null;
  on: boolean;
};

// Add-on products the customer can switch on or off. The switches are not
// buttons in the hierarchy: the page keeps its single primary action.
export function Addons({ subscriptionId, addons }: { subscriptionId: number; addons: AddonOption[] }) {
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<number | null>(null);

  function toggle(addon: AddonOption) {
    setBusyId(addon.id);
    startTransition(async () => {
      const result = await setMyAddon(subscriptionId, addon.id, !addon.on);
      if (result.ok) toast.success(result.message);
      else toast.error(result.error);
      setBusyId(null);
    });
  }

  return (
    <Card className="mb-6">
      <SectionHeader title="Add-ons" description="Changes apply from your next invoice. No partial charges." />
      <ul className="divide-y">
        {addons.map((addon) => {
          const labelId = `addon-${addon.id}`;
          return (
            <li key={addon.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <div id={labelId} className="text-sm font-medium">
                  {addon.name}
                </div>
                <div className="text-xs text-muted-foreground tabular-nums">
                  {addon.price}
                  {addon.tax ? ` · ${addon.tax}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{busyId === addon.id ? "Saving…" : addon.on ? "On" : "Off"}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={addon.on}
                  aria-labelledby={labelId}
                  disabled={pending}
                  onClick={() => toggle(addon)}
                  className={cx(
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                    addon.on ? "bg-primary" : "bg-input",
                  )}
                >
                  <span
                    aria-hidden
                    className={cx(
                      "block size-4 rounded-full bg-background shadow-xs transition-transform",
                      addon.on ? "translate-x-4.5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
