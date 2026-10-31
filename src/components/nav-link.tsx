"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CreditCard,
  FileStack,
  FileText,
  LayoutDashboard,
  Percent,
  Receipt,
  Repeat,
  Settings,
  Tags,
  Users,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icons are looked up by name because components can't be passed from server layouts.
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  reports: BarChart3,
  subscriptions: Repeat,
  templates: FileStack,
  invoices: FileText,
  payments: CreditCard,
  products: Boxes,
  plans: Tags,
  taxes: Receipt,
  discounts: Percent,
  users: Users,
  settings: Settings,
  profile: User,
};

export function NavLink({
  href,
  children,
  exact = false,
  icon,
  variant = "sidebar",
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  icon?: string;
  variant?: "sidebar" | "top";
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = icon ? ICONS[icon] : undefined;

  return (
    <Link
      href={href}
      className={cn(
        "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
        variant === "sidebar" && "hover:translate-x-0.5",
        active
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
      {children}
      {active && variant === "sidebar" && (
        <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary animate-in fade-in zoom-in-50" />
      )}
    </Link>
  );
}
