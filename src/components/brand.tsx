import { Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_1px_2px_rgb(0_0_0/0.15)]",
        className,
      )}
    >
      {children ?? <Repeat className="size-4" strokeWidth={2.25} />}
    </span>
  );
}

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <div className="min-w-0 leading-tight">
        <p className="text-base font-semibold tracking-tight">SubFlow</p>
        {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
