import Link from "next/link";
import { LinkIcon } from "lucide-react";
import { ButtonLink, Card } from "@/components/kit";

// Shown when a reset link is missing, unknown, already used or expired.
export function LinkInvalid() {
  return (
    <Card className="space-y-4 text-center">
      <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive animate-in fade-in zoom-in-95 duration-500">
        <LinkIcon className="size-5" aria-hidden />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">This link is invalid or has expired</h1>
        <p className="text-sm text-muted-foreground">
          Reset links work once and expire after 30 minutes. Request a new one to continue.
        </p>
      </div>
      <ButtonLink href="/forgot-password" className="w-full">
        Request a new link
      </ButtonLink>
      <p className="text-sm text-slate-500">
        <Link href="/login" className="text-indigo-600 hover:underline">
          Back to log in
        </Link>
      </p>
    </Card>
  );
}
