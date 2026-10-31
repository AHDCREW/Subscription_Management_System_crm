import type { ReactNode } from "react";
import { NavLink } from "@/components/nav-link";
import { UserMenu } from "@/components/user-menu";
import { SidebarSearch, type SearchItem } from "@/components/sidebar-search";

export type ShellNavItem = { href: string; label: string; icon: string; exact?: boolean };
export type ShellNavSection = { section?: string; items: ShellNavItem[] };

// The app frame shared by the staff dashboard and the customer portal:
// grey canvas → light frame with the sidebar → white content panel.
export function AppShell({
  brand,
  sections,
  footer = [],
  user,
  children,
}: {
  brand: ReactNode;
  sections: ShellNavSection[];
  footer?: ShellNavItem[];
  user: { name: string; subtitle: string };
  children: ReactNode;
}) {
  const searchItems: SearchItem[] = [...sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.section }))), ...footer];

  return (
    <div className="min-h-screen p-2.5 print:p-0">
      <div className="flex min-h-[calc(100vh-1.25rem)] flex-col rounded-2xl border bg-sidebar shadow-xs md:flex-row print:min-h-0 print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
        <aside className="no-print flex shrink-0 flex-col animate-in fade-in slide-in-from-left-4 duration-500 md:sticky md:top-2.5 md:h-[calc(100vh-1.25rem)] md:w-64">
          <div className="px-4 pt-5 pb-4">{brand}</div>
          <div className="px-4 pb-4">
            <SidebarSearch items={searchItems} />
          </div>
          <nav className="flex gap-0.5 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto">
            {sections.map(({ section, items }, index) => (
              <div key={section ?? index} className="flex gap-0.5 md:flex-col">
                {section && (
                  <p className="hidden px-3 pb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground md:block">
                    {section}
                  </p>
                )}
                {items.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact} icon={item.icon}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="px-3 pb-3">
            {footer.length > 0 && (
              <div className="mb-3 flex flex-col gap-0.5">
                {footer.map((item) => (
                  <NavLink key={item.href} href={item.href} exact={item.exact} icon={item.icon}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            )}
            <div className="border-t px-1 pt-3">
              <UserMenu name={user.name} subtitle={user.subtitle} />
            </div>
          </div>
        </aside>
        <main className="m-2 min-w-0 flex-1 rounded-xl border bg-card shadow-xs md:ml-0 print:m-0 print:rounded-none print:border-0 print:shadow-none">
          <div className="mx-auto max-w-6xl px-6 pb-10 md:px-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
