import Link from "next/link";
import { formatMoney } from "@/lib/money";
import { PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { formatDay } from "@/lib/subscriptions/subscriptions";
import { Table, Td, Th } from "@/components/kit";
import { StatusBadge } from "@/app/dashboard/subscriptions/status";
import { recurringTotal, showsNextBill, type CustomerSubscriptionRow } from "./data";

export function SubscriptionsTable({ subscriptions }: { subscriptions: CustomerSubscriptionRow[] }) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Number</Th>
          <Th>Plan</Th>
          <Th>Status</Th>
          <Th>Start</Th>
          <Th>Expiry</Th>
          <Th>Next bill</Th>
          <Th className="text-right">Amount</Th>
        </tr>
      </thead>
      <tbody>
        {subscriptions.map((sub) => (
          <tr key={sub.id} className="transition-colors hover:bg-muted/40">
            <Td>
              <Link
                href={`/portal/subscriptions/${sub.id}`}
                className="font-medium tabular-nums underline decoration-foreground/25 underline-offset-4 hover:decoration-foreground"
              >
                {sub.number}
              </Link>
            </Td>
            <Td>{sub.plan.name}</Td>
            <Td>
              <StatusBadge status={sub.status} requested={sub.requestedAt !== null} />
            </Td>
            <Td className="tabular-nums">{formatDay(sub.startDate)}</Td>
            <Td className="tabular-nums">{sub.expiryDate ? formatDay(sub.expiryDate) : "Until closed"}</Td>
            <Td className="tabular-nums">{showsNextBill(sub.status) ? formatDay(sub.nextInvoiceDate) : "—"}</Td>
            <Td className="text-right tabular-nums">
              {formatMoney(recurringTotal(sub))}
              <span className="text-muted-foreground"> / {PERIOD_UNIT[sub.plan.billingPeriod]}</span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
