import type { Role } from "@prisma/client";
import { requireTeam } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { NavLink } from "@/components/nav-link";

type NavItem = { href: string; label: string; roles?: Role[]; exact?: boolean };

const NAV: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ href: "/dashboard", label: "Dashboard", exact: true }, { href: "/dashboard/reports", label: "Reports" }] },
  {
    section: "Sales",
    items: [
      { href: "/dashboard/subscriptions", label: "Subscriptions" },
      { href: "/dashboard/templates", label: "Quotation templates" },
    ],
  },
  {
    section: "Billing",
    items: [
      { href: "/dashboard/invoices", label: "Invoices" },
      { href: "/dashboard/payments", label: "Payments" },
    ],
  },
  {
    section: "Catalog",
    items: [
      { href: "/dashboard/products", label: "Products" },
      { href: "/dashboard/plans", label: "Plans" },
      { href: "/dashboard/taxes", label: "Taxes", roles: ["ADMIN"] },
      { href: "/dashboard/discounts", label: "Discounts", roles: ["ADMIN"] },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/dashboard/users", label: "Users & staff", roles: ["ADMIN"] },
      { href: "/dashboard/settings", label: "Company settings", roles: ["ADMIN"] },
    ],
  },
];

export default async function DashboardLayout({ children }: LayoutProps<"/dashboard">) {
  const user = await requireTeam();

  return (
    <div className="flex min-h-screen">
      <aside className="no-print flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-5">
          <p className="text-xl font-bold text-indigo-600">SubFlow</p>
          <p className="text-xs text-slate-500">Brightloop Software</p>
        </div>
        <nav className="flex-1 space-y-5 overflow-y-auto px-3">
          {NAV.map(({ section, items }) => {
            const visible = items.filter((item) => !item.roles || item.roles.includes(user.role));
            if (!visible.length) return null;
            return (
              <div key={section}>
                <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{section}</p>
                {visible.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 px-5 py-4 text-sm">
          <p className="font-medium text-slate-900">{user.name}</p>
          <p className="text-xs text-slate-500">{user.role === "ADMIN" ? "Admin" : "Staff"}</p>
          <form action={logout}>
            <button className="mt-2 text-xs text-slate-500 hover:text-slate-900">Log out</button>
          </form>
        </div>
      </aside>
      <main className="flex-1 overflow-x-auto px-8 py-8">{children}</main>
    </div>
  );
}
