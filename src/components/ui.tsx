import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

// Small shared UI kit. Every module builds its pages from these so the app looks consistent.

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonStyles = {
  primary: "bg-indigo-600 text-white hover:bg-indigo-700",
  secondary: "bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50",
  danger: "bg-rose-600 text-white hover:bg-rose-700",
  ghost: "text-slate-600 hover:bg-slate-100",
};

type Variant = keyof typeof buttonStyles;

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cx(buttonBase, buttonStyles[variant], className)} {...props} />;
}

const fieldStyles =
  "block w-full rounded-md border-0 px-3 py-2 text-sm text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(fieldStyles, className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cx(fieldStyles, "bg-white", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(fieldStyles, className)} rows={3} {...props} />;
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export function Checkbox({ label, ...props }: ComponentProps<"input"> & { label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-indigo-600" {...props} />
      {label}
    </label>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cx("rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200", className)} {...props} />;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

const badgeTones = {
  gray: "bg-slate-100 text-slate-700",
  blue: "bg-blue-50 text-blue-700",
  indigo: "bg-indigo-50 text-indigo-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-rose-50 text-rose-700",
};

export type BadgeTone = keyof typeof badgeTones;

export function Badge({ tone = "gray", children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={cx("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", badgeTones[tone])}>{children}</span>
  );
}

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <table className="min-w-full divide-y divide-slate-200 text-sm">{children}</table>
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return <th className={cx("bg-slate-50 px-4 py-3 text-left font-medium text-slate-600", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cx("border-t border-slate-100 px-4 py-3 text-slate-700", className)} {...props} />;
}

export function EmptyState({ message, action }: { message: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-12 text-center text-sm text-slate-500">
      <p>{message}</p>
      {action}
    </Card>
  );
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-md px-3 py-2 text-sm",
        tone === "red" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {children}
    </div>
  );
}
