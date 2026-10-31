import { cn } from "@/lib/utils";

// Brightloop logo: a lowercase "b" whose bowl is a loop (recurring billing) around a bright
// yellow core. Colours follow the brief: Odoo purple, Odoo grey and highlighter yellow.
const VARIANTS = {
  color: { ink: "var(--primary)", core: "var(--sun)" },
  // For purple backgrounds and the app icon.
  reversed: { ink: "#ffffff", core: "var(--sun)" },
} as const;

export function BrightloopMark({ variant = "color", className }: { variant?: keyof typeof VARIANTS; className?: string }) {
  const { ink, core } = VARIANTS[variant];
  return (
    <svg viewBox="0 0 64 64" className={cn("shrink-0", className)} aria-hidden>
      <path d="M19 7V41" stroke={ink} strokeWidth="9" strokeLinecap="round" />
      <circle cx="33.5" cy="41" r="14.5" fill="none" stroke={ink} strokeWidth="9" />
      <circle cx="33.5" cy="41" r="5.5" fill={core} />
    </svg>
  );
}

// "brightloop" in two tones, like the brief's logo: purple "bright", grey "loop".
export function Wordmark({ className, reversed = false }: { className?: string; reversed?: boolean }) {
  return (
    <span className={cn("font-sans font-bold tracking-[-0.03em] whitespace-nowrap", className)}>
      <span className={reversed ? "text-white" : "text-primary"}>bright</span>
      <span className={reversed ? "text-white/70" : "text-stone"}>loop</span>
    </span>
  );
}

// App-icon tile (purple square with the white mark). Children replace the mark.
export function BrandMark({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(79_49_73/0.3)]",
        className,
      )}
    >
      {children ?? <BrightloopMark variant="reversed" className="size-6" />}
    </span>
  );
}

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <BrightloopMark className="size-9" />
      <div className="min-w-0 leading-tight">
        <Wordmark className="block text-xl leading-none" />
        {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
