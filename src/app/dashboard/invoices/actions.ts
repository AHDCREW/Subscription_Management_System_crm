"use server";

import { revalidatePath } from "next/cache";
import { requireTeam } from "@/lib/auth";
import { runBilling, type BillingRunSummary } from "@/lib/billing/run";

/** "Run billing now": invoices everything due up to today. Safe to press twice. */
export async function runBillingNow(): Promise<BillingRunSummary> {
  await requireTeam();
  const summary = await runBilling({ today: new Date() });
  revalidatePath("/dashboard/invoices");
  revalidatePath("/dashboard");
  return summary;
}
