import type { InvoiceStatus } from "@prisma/client";
import { Badge, type BadgeTone } from "@/components/kit";

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  DRAFT: { label: "Draft", tone: "gray" },
  CONFIRMED: { label: "Confirmed", tone: "indigo" },
  PAID: { label: "Paid", tone: "green" },
  CANCELLED: { label: "Cancelled", tone: "gray" },
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  const info = STATUS[status];
  return <Badge tone={info.tone}>{info.label}</Badge>;
}

export function OverdueBadge() {
  return <Badge tone="red">Overdue</Badge>;
}
