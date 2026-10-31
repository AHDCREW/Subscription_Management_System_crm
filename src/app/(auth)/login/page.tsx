import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <LoginForm />;
}
