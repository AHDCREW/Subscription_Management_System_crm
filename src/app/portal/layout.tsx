import { requireCustomer } from "@/lib/auth";
import { Brand } from "@/components/brand";
import { AppShell } from "@/components/app-shell";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();
  return (
    <AppShell
      brand={<Brand subtitle="Customer portal" />}
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
