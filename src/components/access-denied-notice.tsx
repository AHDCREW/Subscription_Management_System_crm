"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

// requireUser sends people home with ?denied=1 when their role can't open a page.
// Explain it with a toast, then drop the flag from the URL.
export function AccessDeniedNotice() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const denied = params.get("denied") === "1";

  useEffect(() => {
    if (!denied) return;
    toast.error("You don't have access to that page", { description: "It's only available to other roles, so we brought you back here." });
    router.replace(pathname, { scroll: false });
  }, [denied, pathname, router]);

  return null;
}
