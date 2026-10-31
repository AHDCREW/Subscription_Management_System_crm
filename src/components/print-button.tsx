"use client";

import type { ComponentProps, ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/kit";

// Opens the browser print dialog (where "Save as PDF" lives). Hide page chrome with `.no-print`.
export function PrintButton({
  children = "Print",
  variant,
}: {
  children?: ReactNode;
  variant?: ComponentProps<typeof Button>["variant"];
}) {
  return (
    <Button type="button" variant={variant} onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> {children}
    </Button>
  );
}
