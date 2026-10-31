import "server-only";
import { db } from "@/lib/db";
import { OPEN_REQUEST } from "@/lib/subscriptions/quote-requests";
import { formatDay } from "@/lib/subscriptions/subscriptions";

export type SubscriptionNotice = {
  kind: "paused" | "quotation" | "confirmed" | "requested" | "none";
  title: string;
  body: string;
  action: { label: string; href: string };
};

// What the portal tells a customer who has no active subscription, or null when one is active.
// The most useful next step wins: resume a paused one, then review a quotation, then wait for a
// confirmed start date, then wait for the team to answer a request, otherwise look at products.
export async function getSubscriptionNotice(customerId: number, companyName: string): Promise<SubscriptionNotice | null> {
  const subs = await db.subscription.findMany({
    where: { customerId, OR: [{ status: { in: ["ACTIVE", "PAUSED", "QUOTATION", "CONFIRMED"] } }, OPEN_REQUEST] },
    select: { id: true, number: true, status: true, startDate: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  if (subs.some((s) => s.status === "ACTIVE")) return null;

  const paused = subs.find((s) => s.status === "PAUSED");
  if (paused) {
    return {
      kind: "paused",
      title: "Your subscription is paused",
      body: `${paused.number} is on hold, so you aren't being billed. Resume it whenever you're ready.`,
      action: { label: "Resume subscription", href: `/portal/subscriptions/${paused.id}` },
    };
  }
  const quotation = subs.find((s) => s.status === "QUOTATION");
  if (quotation) {
    return {
      kind: "quotation",
      title: "You have a quotation to review",
      body: `${companyName} sent you quotation ${quotation.number}. Once our team confirms it, your subscription starts.`,
      action: { label: "Review quotation", href: `/portal/subscriptions/${quotation.id}` },
    };
  }
  const confirmed = subs.find((s) => s.status === "CONFIRMED");
  if (confirmed) {
    return {
      kind: "confirmed",
      title: "Your subscription starts soon",
      body: `${confirmed.number} is confirmed and starts on ${formatDay(confirmed.startDate)}.`,
      action: { label: "View subscription", href: `/portal/subscriptions/${confirmed.id}` },
    };
  }
  // Only open requests are left in the list as drafts.
  const requested = subs.find((s) => s.status === "DRAFT");
  if (requested) {
    return {
      kind: "requested",
      title: "Your quotation request is with our team",
      body: `${companyName}'s team is reviewing request ${requested.number} and will send you a quotation.`,
      action: { label: "View request", href: `/portal/subscriptions/${requested.id}` },
    };
  }
  return {
    kind: "none",
    title: "You don't have an active subscription",
    body: `Choose a plan and request a quotation. ${companyName}'s team will send you one to get started.`,
    action: { label: "Browse products", href: "/portal/products" },
  };
}
