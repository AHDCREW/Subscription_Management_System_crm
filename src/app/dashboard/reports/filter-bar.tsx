import Form from "next/form";
import { toDateInput } from "@/lib/subscriptions/subscriptions";
import {
  DATE_FIELD_LABEL,
  hasFilters,
  statusFilterLabel,
  statusOptions,
  type ReportFilters,
} from "@/lib/reports/filters";
import { Button, ButtonLink, Input, Select } from "@/components/kit";

// Shared filter bar. A GET form, so every filter ends up in the URL and the
// page, its pagination and the CSV export all read the same values.

function Label({ htmlFor, children }: { htmlFor: string; children: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs text-muted-foreground">
      {children}
    </label>
  );
}

export function FilterBar({ filters, plans }: { filters: ReportFilters; plans: { id: number; name: string; active: boolean }[] }) {
  const options = statusOptions(filters.tab);
  const dateLabel = DATE_FIELD_LABEL[filters.tab];

  return (
    <Form
      action="/dashboard/reports"
      className="mb-4 flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4"
      aria-label="Report filters"
    >
      <input type="hidden" name="tab" value={filters.tab} />
      <div>
        <Label htmlFor="report-from">{`${dateLabel} from`}</Label>
        <Input id="report-from" name="from" type="date" defaultValue={toDateInput(filters.from)} className="w-40" />
      </div>
      <div>
        <Label htmlFor="report-to">To</Label>
        <Input id="report-to" name="to" type="date" defaultValue={toDateInput(filters.to)} className="w-40" />
      </div>
      {options.length > 0 && (
        <div>
          <Label htmlFor="report-status">{statusFilterLabel(filters.tab)}</Label>
          <Select id="report-status" name="status" defaultValue={filters.status} className="w-36">
            <option value="">Any</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="min-w-48 flex-1">
        <Label htmlFor="report-q">Customer</Label>
        <Input
          id="report-q"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder={filters.tab === "subscriptions" ? "Name, email, company or SUB-number" : "Name, email, company or INV-number"}
        />
      </div>
      <div>
        <Label htmlFor="report-plan">Plan</Label>
        <Select id="report-plan" name="plan" defaultValue={filters.planId ? String(filters.planId) : ""} className="w-44">
          <option value="">Any plan</option>
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.active ? plan.name : `${plan.name} (inactive)`}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {hasFilters(filters) && (
          <ButtonLink href={`/dashboard/reports?tab=${filters.tab}`} variant="ghost">
            Reset
          </ButtonLink>
        )}
      </div>
    </Form>
  );
}
