"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const POLL_MS = 20_000;

// Checks for new customer requests while the dashboard is open. When one arrives it shows a
// toast and refreshes the page data, so the Customers bubble updates without a reload.
export function PendingRequestsWatcher({ count }: { count: number }) {
  const router = useRouter();
  const known = useRef(count);

  useEffect(() => {
    known.current = count;
  }, [count]);

  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      const res = await fetch("/dashboard/customers/requests", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data: { count: number; latest: { name: string; company: string | null } | null } = await res.json();
      if (data.count > known.current && data.latest) {
        toast("New customer request", {
          description: `${data.latest.name}${data.latest.company ? ` (${data.latest.company})` : ""} is waiting for approval.`,
          action: { label: "Review", onClick: () => router.push("/dashboard/customers?tab=pending") },
          duration: 10_000,
        });
      }
      if (data.count !== known.current) {
        known.current = data.count;
        router.refresh();
      }
    };
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
