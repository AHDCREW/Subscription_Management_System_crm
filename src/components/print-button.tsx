"use client";

import type { ReactNode } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/kit";

// Opens the browser print dialog (where "Save as PDF" lives). Hide page chrome with `.no-print`.
export function PrintButton({ children = "Print" }: { children?: ReactNode }) {
  return (
    <Button type="button" onClick={() => window.print()}>
      <Printer className="size-4" aria-hidden /> {children}
    </Button>
  );
}
