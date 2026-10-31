import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { PENDING_CUSTOMERS } from "@/lib/account-approval";

// Polled by the dashboard so a new customer request shows up as a bubble without a reload.
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role === "CUSTOMER") return Response.json({ error: "Not allowed" }, { status: 403 });

  const [count, latest] = await Promise.all([
    db.user.count({ where: PENDING_CUSTOMERS }),
    db.user.findFirst({ where: PENDING_CUSTOMERS, orderBy: { createdAt: "desc" }, select: { name: true, company: true } }),
  ]);
  return Response.json({ count, latest });
}
