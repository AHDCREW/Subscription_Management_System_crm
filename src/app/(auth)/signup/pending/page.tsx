import { MailCheck } from "lucide-react";
import { ButtonLink, Card } from "@/components/kit";

// Shown after signup. The account exists but can't log in until an admin or
// staff member approves it.
export default function SignupPendingPage() {
  return (
    <Card className="space-y-4 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-warning/10 text-warning animate-in fade-in zoom-in-95 duration-500">
        <MailCheck className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Account created, waiting for approval</h1>
        <p className="text-sm text-muted-foreground">
          Thanks for signing up. Someone on our team will review your account shortly. We&apos;ll email you as soon as
          it&apos;s approved, and then you can log in.
        </p>
      </div>
      <ButtonLink href="/login" variant="secondary" className="w-full">
        Back to log in
      </ButtonLink>
    </Card>
  );
}
