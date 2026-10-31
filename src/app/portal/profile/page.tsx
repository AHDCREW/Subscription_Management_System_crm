import { requireCustomer } from "@/lib/auth";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/kit";
import { DetailsForm, PasswordForm } from "./profile-forms";

export default async function ProfilePage() {
  const user = await requireCustomer();
  const profile = await db.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { name: true, email: true, company: true, phone: true, address: true },
  });

  return (
    <>
      <PageHeader title="Profile" description="Your contact details and password." />
      <div className="space-y-6">
        <DetailsForm
          email={profile.email}
          initial={{
            name: profile.name,
            company: profile.company ?? "",
            phone: profile.phone ?? "",
            address: profile.address ?? "",
          }}
        />
        <PasswordForm />
      </div>
    </>
  );
}
