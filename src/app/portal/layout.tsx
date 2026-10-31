import { requireCustomer } from "@/lib/auth";
import { NavLink } from "@/components/nav-link";
import { UserMenu } from "@/components/user-menu";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-10 border-b bg-background animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-6 px-6 py-3">
          <div>
            <p className="text-base font-semibold tracking-tight">Brightloop Software</p>
            <p className="text-xs text-muted-foreground">Customer portal</p>
          </div>
          <nav className="flex items-center gap-1">
            <NavLink href="/portal" exact icon="dashboard" variant="top">
              Overview
            </NavLink>
            <NavLink href="/portal/subscriptions" icon="subscriptions" variant="top">
              Subscriptions
            </NavLink>
            <NavLink href="/portal/invoices" icon="invoices" variant="top">
              Invoices
            </NavLink>
            <NavLink href="/portal/profile" icon="profile" variant="top">
              Profile
            </NavLink>
          </nav>
          <div className="w-56">
            <UserMenu name={user.name} subtitle={user.email} />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
      <footer className="no-print pb-8 text-center text-xs text-muted-foreground">Powered by SubFlow</footer>
    </div>
  );
}
