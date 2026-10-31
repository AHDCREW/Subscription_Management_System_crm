import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { BrandMark } from "@/components/brand";
import { AppShell } from "@/components/app-shell";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();
  const company = await db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } });
  const companyName = company?.name ?? "Brightloop Software";

  return (
    <AppShell
      brand={
        <div className="flex items-center gap-2.5">
          <BrandMark>
            <span className="text-sm font-semibold">{companyName.charAt(0).toUpperCase()}</span>
          </BrandMark>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-base font-semibold tracking-tight">{companyName}</p>
            <p className="text-xs text-muted-foreground">Customer portal · Powered by SubFlow</p>
          </div>
        </div>
      }
      sections={[
        {
          section: "Your account",
          items: [
            { href: "/portal", label: "Overview", icon: "dashboard", exact: true },
            { href: "/portal/subscriptions", label: "Subscriptions", icon: "subscriptions" },
            { href: "/portal/invoices", label: "Invoices", icon: "invoices" },
          ],
        },
      ]}
      footer={[{ href: "/portal/profile", label: "Profile", icon: "profile" }]}
      user={{ name: user.name, subtitle: user.email }}
    >
      {children}
    </AppShell>
  );
}
