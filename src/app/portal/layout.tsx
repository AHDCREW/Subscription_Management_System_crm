import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { NavLink } from "@/components/nav-link";
import { UserMenu } from "@/components/user-menu";

const NAV = [
  { href: "/portal", label: "Overview", icon: "dashboard", exact: true },
  { href: "/portal/subscriptions", label: "Subscriptions", icon: "subscriptions" },
  { href: "/portal/invoices", label: "Invoices", icon: "invoices" },
  { href: "/portal/profile", label: "Profile", icon: "profile" },
];

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();
  const company = await db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } });
  const companyName = company?.name ?? "Brightloop Software";

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="no-print flex shrink-0 flex-col border-b bg-sidebar animate-in fade-in slide-in-from-left-4 duration-500 md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-brand">
            {companyName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate font-semibold tracking-tight">{companyName}</p>
            <p className="text-xs text-muted-foreground">Customer portal</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-visible md:pb-4">
          <p className="hidden px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70 md:block">
            Your account
          </p>
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact} icon={item.icon}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <UserMenu name={user.name} subtitle={user.email} />
          <p className="mt-3 text-[11px] text-muted-foreground">Powered by SubFlow</p>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-6 py-8 md:px-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
