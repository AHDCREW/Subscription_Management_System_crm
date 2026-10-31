import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/kit";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  await requireAdmin();
  const settings = await db.companySettings.findUnique({ where: { id: 1 } });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Company settings"
        description="These details appear on invoices and in the customer portal."
      />
      <SettingsForm
        initial={{
          name: settings?.name ?? "",
          email: settings?.email ?? "",
          phone: settings?.phone ?? "",
          address: settings?.address ?? "",
          gstNumber: settings?.gstNumber ?? "",
          currency: settings?.currency ?? "INR",
          invoiceTag: settings?.invoiceTag ?? "INV",
        }}
      />
    </div>
  );
}
