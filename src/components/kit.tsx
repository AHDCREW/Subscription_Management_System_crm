import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AlertCircle, CheckCircle2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button as UIButton } from "@/components/ui/button";
import { Input as UIInput } from "@/components/ui/input";
import { Textarea as UITextarea } from "@/components/ui/textarea";
import { Badge as UIBadge } from "@/components/ui/badge";
import { Alert as UIAlert, AlertDescription } from "@/components/ui/alert";
import { TableHead, TableCell } from "@/components/ui/table";
import BlurText from "@/components/reactbits/BlurText";

// SubFlow's app kit: thin wrappers over shadcn/ui so every module shares one look.
// Pages import from here; reach for "@/components/ui/*" directly for anything richer.

export const cx = cn;

const variantMap = {
  primary: "default",
  secondary: "outline",
  danger: "destructive",
  ghost: "ghost",
} as const;

type Variant = keyof typeof variantMap;

const variantClass: Record<Variant, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.25)] hover:bg-primary/88",
  secondary: "border-border bg-card shadow-xs hover:bg-muted",
  danger: "",
  ghost: "",
};

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <UIButton
      variant={variantMap[variant]}
      size="lg"
      className={cn("h-9 rounded-lg px-4", variantClass[variant], className)}
      {...props}
    />
  );
}

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return (
    <UIButton asChild variant={variantMap[variant]} size="lg" className={cn("h-9 rounded-lg px-4", variantClass[variant], className)}>
      <Link {...props} />
    </UIButton>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <UIInput className={cn("h-9 rounded-lg bg-card shadow-xs", className)} {...props} />;
}

// Native select keeps plain FormData submission working in server actions.
export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "flex h-9 w-full rounded-lg border border-input bg-card px-2.5 text-sm shadow-xs outline-none transition-[color,box-shadow]",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <UITextarea className={cn("rounded-lg bg-card shadow-xs", className)} rows={3} {...props} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-muted-foreground">{hint}</span>}
      {error && <span className="block text-xs text-destructive">{error}</span>}
    </label>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className={cn("size-4 rounded border-input accent-primary", className)} {...props} />
      {label}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-xl border bg-card p-6 text-card-foreground shadow-xs", className)}
      {...props}
    />
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="-mx-6 mb-7 flex flex-wrap items-center justify-between gap-4 border-b px-6 py-5 md:-mx-8 md:px-8">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">
          <BlurText key={title} text={title} animateBy="words" direction="top" trigger="load" stepDuration={0.25} distance={12} blur={6} />
        </h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground animate-in fade-in duration-700">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2 animate-in fade-in slide-in-from-right-2 duration-500">{actions}</div>}
    </div>
  );
}

// Second level of the type scale: titles inside cards and page sections.
export function SectionHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// Label/value pairs for detail pages: label is meta (xs, muted), value is body text.
export function DetailItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm">{children}</dd>
    </div>
  );
}

// Colour roles (see docs/UI_GUIDELINES.md). Each tone has one meaning everywhere:
// gray = draft/neutral, blue = in progress, indigo (ink) = confirmed/committed, green = success/active/paid,
// amber = needs attention, red = overdue/failed, outline = categories (not a status).
const badgeDots = {
  gray: "bg-muted-foreground/50",
  blue: "bg-info",
  indigo: "bg-primary",
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
  outline: "",
};

const badgeText = {
  gray: "text-muted-foreground",
  blue: "text-info",
  indigo: "text-foreground",
  green: "text-success",
  amber: "text-warning",
  red: "text-destructive",
  outline: "text-foreground",
};

export type BadgeTone = keyof typeof badgeDots;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <UIBadge
      variant="outline"
      className={cn("gap-1.5 rounded-full border-border bg-card px-2.5 py-0.5 font-medium shadow-xs", badgeText[tone])}
    >
      {tone !== "outline" && <span className={cn("size-1.5 shrink-0 rounded-full", badgeDots[tone])} aria-hidden />}
      {children}
    </UIBadge>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card p-2 shadow-xs animate-in fade-in slide-in-from-bottom-1 duration-500">
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">{children}</table>
      </div>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <TableHead
      className={cn("h-10 bg-muted px-4 font-normal text-muted-foreground first:rounded-l-lg last:rounded-r-lg", className)}
      {...props}
    />
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <TableCell className={cn("border-t border-border/70 px-4 py-3.5 [tr:first-child>&]:border-t-0", className)} {...props} />;
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card py-14 text-center text-sm text-muted-foreground animate-in fade-in zoom-in-95 duration-500">
      <Inbox className="size-8 text-muted-foreground/60" aria-hidden />
      <p>{message}</p>
      {action}
    </div>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green"; children: ReactNode }) {
  const Icon = tone === "red" ? AlertCircle : CheckCircle2;
  return (
    <UIAlert
      variant={tone === "red" ? "destructive" : "default"}
      className={cn(
        "animate-in fade-in slide-in-from-top-1 duration-300",
        tone === "green" && "border-success/30 bg-success/5 text-success",
      )}
    >
      <Icon />
      <AlertDescription className={tone === "green" ? "text-success" : undefined}>{children}</AlertDescription>
    </UIAlert>
  );
}
