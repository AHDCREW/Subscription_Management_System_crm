"use client";

import { Button } from "@/components/kit";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { LoginFields } from "@/app/(auth)/login/login-form";

// Log in without leaving the landing page. /login still works for direct links and redirects.
export function LoginDialog({
  label = "Log in",
  variant = "ghost",
  className,
}: {
  label?: string;
  variant?: "primary" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant={variant} className={className}>
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Log in</DialogTitle>
          <DialogDescription>Welcome back. Use the email and password you signed up with.</DialogDescription>
        </DialogHeader>
        <LoginFields />
      </DialogContent>
    </Dialog>
  );
}
