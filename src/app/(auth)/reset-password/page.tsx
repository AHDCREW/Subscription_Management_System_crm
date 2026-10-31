import { findValidResetToken } from "@/lib/password-reset";
import { LinkInvalid } from "./link-invalid";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const { token } = await searchParams;
  const value = typeof token === "string" ? token : "";

  if (!(await findValidResetToken(value))) return <LinkInvalid />;
  return <ResetPasswordForm token={value} />;
}
