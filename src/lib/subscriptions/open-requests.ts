import "server-only";
import { db } from "@/lib/db";
import { OPEN_REQUEST } from "@/lib/subscriptions/quote-requests";

// Quotation requests from the portal waiting for the team: the count for the
// Subscriptions bubble and the newest one for the dashboard's toast. Both read
// the (status, requestedAt) index.
export async function getOpenRequestSummary() {
  const [count, latest] = await Promise.all([
    db.subscription.count({ where: OPEN_REQUEST }),
    db.subscription.findFirst({
      where: OPEN_REQUEST,
      orderBy: [{ requestedAt: "desc" }, { id: "desc" }],
      select: { id: true, number: true, customer: { select: { name: true, company: true } } },
    }),
  ]);
  return { count, latest };
}
