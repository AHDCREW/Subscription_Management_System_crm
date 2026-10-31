import type { Role } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { AppShell, type ShellNavSection } from "@/components/app-shell";

type NavItem = { href: string; label: string; icon: string; roles?: Role[]; exact?: boolean };

const NAV: { section?: string; items: NavItem[] }[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true }, { href: "/dashboard/reports", label: "Reports", icon: "reports" }] },
  {
    section: "Sales",
    items: [
      { href: "/dashboard/customers", label: "Customers", icon: "customers" },
      { href: "/dashboard/subscriptions", label: "Subscriptions", icon: "subscriptions" },
      { href: "/dashboard/templates", label: "Quotation templates", icon: "templates" },
    ],
  },
  {
    section: "Billing",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: "invoices" },
      { href: "/dashboard/payments", label: "Payments", icon: "payments" },
      { href: "/dashboard/billing-runs", label: "Billing runs", icon: "billingRuns" },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/dashboard/products", label: "Products", icon: "products" },
      { href: "/dashboard/plans", label: "Plans", icon: "plans" },
      { href: "/dashboard/taxes", label: "Taxes", icon: "taxes", roles: ["ADMIN"] },
      { href: "/dashboard/discounts", label: "Discounts", icon: "discounts", roles: ["ADMIN"] },
    ],
  },
];

const FOOTER: NavItem[] = [
  { href: "/dashboard/users", label: "Staff", icon: "users", roles: ["ADMIN"] },
  { href: "/dashboard/settings", label: "Settings", icon: "settings", roles: ["ADMIN"] },
];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireTeam();
  const allowed = (item: NavItem) => !item.roles || item.roles.includes(user.role);
  const strip = (item: NavItem) => ({ href: item.href, label: item.label, icon: item.icon, exact: item.exact });

  const sections: ShellNavSection[] = NAV.map(({ section, items }) => ({ section, items: items.filter(allowed).map(strip) })).filter(
    (s) => s.items.length > 0,
  );

  return (
    <AppShell
      brand={<Brand subtitle={user.role === "ADMIN" ? "Admin dashboard" : "Staff dashboard"} />}
      sections={sections}
      footer={FOOTER.filter(allowed).map(strip)}
      user={{ name: user.name, subtitle: user.role === "ADMIN" ? "Admin" : "Staff" }}
    >
      {children}
    </AppShell>
  );
}
