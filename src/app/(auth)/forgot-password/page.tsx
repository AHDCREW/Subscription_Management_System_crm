import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <ForgotPasswordForm />;
}
