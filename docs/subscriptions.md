# Part 3: Subscriptions

**Owner:** muhammedshafykm-ops

Turning an offer into a running subscription, and the customer's own view of it.

## Scope
- **Quotation templates:** a preset plan and product lines, valid for a set number of days
- **Subscriptions:** number, customer, plan, start date, expiry date, payment terms
- **Lines:** product, variant, quantity, unit price, tax and amount
- **Status flow:** Draft → Quotation → Confirmed → Active → Closed, visible to the whole team
  - Staff confirm quotations
  - Confirmed becomes Active on the start date
- **Customer portal:** customers see only their own subscriptions and invoices

## Folders
- `src/app/dashboard/{templates,subscriptions}`
- `src/app/portal/`
- `src/lib/subscriptions/`

## Tables
`QuotationTemplate`, `QuotationTemplateLine`, `Subscription`, `SubscriptionLine`
