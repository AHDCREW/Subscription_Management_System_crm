import type { Role } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { Brand } from "@/components/brand";
import { UserMenu } from "@/components/user-menu";

type NavItem = { href: string; label: string; icon: string; roles?: Role[]; exact?: boolean };

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: "dashboard", exact: true }, { href: "/dashboard/reports", label: "Reports", icon: "reports" }] },
  {
    section: "Sales",
    items: [
      { href: "/dashboard/subscriptions", label: "Subscriptions", icon: "subscriptions" },
      { href: "/dashboard/templates", label: "Quotation templates", icon: "templates" },
    ],
  },
  {
    section: "Billing",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: "invoices" },
      { href: "/dashboard/payments", label: "Payments", icon: "payments" },
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
  {
    section: "Admin",
    items: [
      { href: "/dashboard/users", label: "Users & staff", icon: "users", roles: ["ADMIN"] },
      { href: "/dashboard/settings", label: "Company settings", icon: "settings", roles: ["ADMIN"] },
    ],
  },
];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireTeam();

  return (
    <div className="flex min-h-screen">
      <aside className="no-print sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r bg-background/80 backdrop-blur animate-in fade-in slide-in-from-left-4 duration-500">
        <div className="px-5 py-5">
          <Brand subtitle="Brightloop Software" />
        </div>
        <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
          {NAV.map(({ section, items }) => {
            const visible = items.filter((item) => !item.roles || item.roles.includes(user.role));
            if (!visible.length) return null;
            return (
              <div key={section} className="space-y-0.5">
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{section}</p>
                {visible.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact} icon={item.icon}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t p-4">
          <UserMenu name={user.name} subtitle={user.role === "ADMIN" ? "Admin" : "Staff"} />
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto px-8 py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
