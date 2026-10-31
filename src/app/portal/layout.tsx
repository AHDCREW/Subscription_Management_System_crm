import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSubscriptionNotice } from "@/lib/subscriptions/portal-notice";
import { Brand } from "@/components/brand";
import { AppShell } from "@/components/app-shell";
import { SubscriptionNoticeBar, SubscriptionNoticePopup } from "./subscription-notice";

export default async function PortalLayout({ children }: LayoutProps<"/portal">) {
  const user = await requireCustomer();
  const company = await db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } });
  // Customers without an active subscription see why, and what to do next, on every portal page.
  const notice = await getSubscriptionNotice(user.id, company?.name ?? "Brightloop Software");
  return (
    <AppShell
      brand={<Brand subtitle="Customer portal" />}
      sections={[
        {
          section: "Your account",
          items: [
            { href: "/portal", label: "Overview", icon: "dashboard", exact: true },
            { href: "/portal/products", label: "Products", icon: "products" },
            { href: "/portal/subscriptions", label: "Subscriptions", icon: "subscriptions" },
            { href: "/portal/invoices", label: "Invoices", icon: "invoices" },
          ],
        },
      ]}
      footer={[{ href: "/portal/profile", label: "Profile", icon: "profile" }]}
      user={{ name: user.name, subtitle: user.email }}
    >
      {notice && (
        <>
          <SubscriptionNoticeBar notice={notice} />
          <SubscriptionNoticePopup notice={notice} />
        </>
      )}
      {children}
    </AppShell>
  );
}
