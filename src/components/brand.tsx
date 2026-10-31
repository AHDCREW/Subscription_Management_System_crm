import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <Repeat className="size-4.5" />
      </span>
      <div className="leading-tight">
        <p className="text-lg font-semibold tracking-tight">SubFlow</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
