import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PENDING_CUSTOMERS } from "@/lib/account-approval";
import { getOpenRequestSummary } from "@/lib/subscriptions/open-requests";

// Polled by the dashboard so new customer requests show up as bubbles without a reload:
// signups waiting for approval, and quotation requests sent from the portal.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "CUSTOMER") return Response.json({ error: "Not allowed" }, { status: 403 });

  const [count, latest, quoteRequests] = await Promise.all([
    db.user.count({ where: PENDING_CUSTOMERS }),
    db.user.findFirst({ where: PENDING_CUSTOMERS, orderBy: { createdAt: "desc" }, select: { name: true, company: true } }),
    getOpenRequestSummary(),
  ]);
  return Response.json({ count, latest, quoteRequests });
}
