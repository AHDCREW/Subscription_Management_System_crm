import { redirect } from "next/navigation";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { SignupForm } from "./signup-form";

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  return <SignupForm />;
}
