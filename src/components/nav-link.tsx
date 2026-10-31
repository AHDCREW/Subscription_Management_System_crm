"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  CreditCard,
  FileStack,
  FileText,
  History,
  LayoutDashboard,
  Percent,
  Receipt,
  Repeat,
  Settings,
  Tags,
  UserCheck,
  Users,
  User,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Icons are looked up by name because components can't be passed from server layouts.
const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  reports: BarChart3,
  customers: UserCheck,
  subscriptions: Repeat,
  templates: FileStack,
  invoices: FileText,
  payments: CreditCard,
  billingRuns: History,
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
  badge,
}: {
  href: string;
  children: React.ReactNode;
  exact?: boolean;
  icon?: string;
  badge?: number;
  variant?: "sidebar" | "top";
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const Icon = icon ? ICONS[icon] : undefined;

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm whitespace-nowrap transition-colors duration-150",
        active
          ? "bg-sidebar-accent font-medium text-foreground"
          : "text-foreground/75 hover:bg-sidebar-accent/60 hover:text-foreground",
      )}
    >
      {Icon && <Icon className={cn("size-[18px] shrink-0", active ? "text-foreground" : "text-foreground/60")} strokeWidth={1.75} aria-hidden />}
      {children}
      {badge ? (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-sun px-1.5 text-[11px] font-semibold text-foreground tabular-nums ring-2 ring-sidebar animate-in zoom-in-50 duration-300">
          <span aria-hidden>{badge > 99 ? "99+" : badge}</span>
          <span className="sr-only">{badge} new</span>
        </span>
      ) : null}
    </Link>
  );
}
