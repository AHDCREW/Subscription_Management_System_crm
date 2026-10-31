"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const POLL_MS = 20_000;

type Customer = { name: string; company: string | null };

type RequestsResponse = {
  count: number;
  latest: Customer | null;
  quoteRequests: { count: number; latest: { id: number; number: string; customer: Customer } | null };
};

const who = (customer: Customer) => `${customer.name}${customer.company ? ` (${customer.company})` : ""}`;

// Checks for new customer requests while the dashboard is open: signups waiting for approval
// and quotation requests from the portal. When one arrives it shows a toast and refreshes the
// page data, so the Customers and Subscriptions bubbles update without a reload.
export function PendingRequestsWatcher({
  count,
  quoteRequests,
  latestQuoteRequestId,
}: {
  count: number;
  quoteRequests: number;
  latestQuoteRequestId: number;
}) {
  const router = useRouter();
  const known = useRef(count);
  const knownQuotes = useRef(quoteRequests);
  // Requests get increasing ids, so a higher one is new. A withdrawn one never lowers it.
  const knownQuoteId = useRef(latestQuoteRequestId);

  useEffect(() => {
    known.current = count;
    knownQuotes.current = quoteRequests;
    knownQuoteId.current = Math.max(knownQuoteId.current, latestQuoteRequestId);
  }, [count, quoteRequests, latestQuoteRequestId]);

  useEffect(() => {
    const check = async () => {
      if (document.hidden) return;
      const res = await fetch("/dashboard/customers/requests", { cache: "no-store" }).catch(() => null);
      if (!res?.ok) return;
      const data: RequestsResponse = await res.json();
      if (data.count > known.current && data.latest) {
        toast("New customer request", {
          description: `${who(data.latest)} is waiting for approval.`,
          action: { label: "Review", onClick: () => router.push("/dashboard/customers?tab=pending") },
          duration: 10_000,
        });
      }
      const quote = data.quoteRequests.latest;
      if (quote && quote.id > knownQuoteId.current) {
        toast(`New quotation request from ${quote.customer.name}`, {
          description: `${quote.number}${quote.customer.company ? ` · ${quote.customer.company}` : ""} is waiting for a quotation.`,
          action: { label: "Review", onClick: () => router.push(`/dashboard/subscriptions/${quote.id}`) },
          duration: 10_000,
        });
        knownQuoteId.current = quote.id;
      }
      if (data.count !== known.current || data.quoteRequests.count !== knownQuotes.current) {
        known.current = data.count;
        knownQuotes.current = data.quoteRequests.count;
        router.refresh();
      }
    };
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  return null;
}
