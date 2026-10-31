import { requireCustomer } from "@/lib/auth";
import { logout } from "@/app/(auth)/actions";
import { NavLink } from "@/components/nav-link";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-lg font-bold text-slate-900">Brightloop Software</p>
            <p className="text-xs text-slate-500">Customer portal</p>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/portal" exact>
              Overview
            </NavLink>
            <NavLink href="/portal/subscriptions">Subscriptions</NavLink>
            <NavLink href="/portal/invoices">Invoices</NavLink>
            <NavLink href="/portal/profile">Profile</NavLink>
          </nav>
          <div className="text-right text-sm">
            <p className="font-medium">{user.name}</p>
            <form action={logout}>
              <button className="text-xs text-slate-500 hover:text-slate-900">Log out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      <footer className="no-print pb-8 text-center text-xs text-slate-400">Powered by SubFlow</footer>
    </div>
  );
}
