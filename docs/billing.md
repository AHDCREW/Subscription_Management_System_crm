# Part 4: Billing

**Owner:** rejanoorjahan-ship-it

Billing day and the money coming in.

## Scope
- **Billing run:** creates invoices from active subscriptions that are due, billed in advance for the coming period
- **Invoices:** customer details, lines, taxes, discounts and totals filled in automatically
- **No double billing:** one invoice per subscription per period (MySQL unique key on `subscriptionId` + `periodStart`); nothing skipped
- **Invoice actions:** confirm, cancel, send, print
- **Invoice status:** Draft → Confirmed → Paid
- **Payments:** method, amount, date and note, recorded against an invoice; partial payments allowed
- **Overdue tracking:** see paid, outstanding and overdue invoices at a glance
- **Demo Pay:** built-in test checkout for customers, with no external payment API

## Folders
- `src/app/dashboard/{invoices,payments}`
- `src/app/portal/invoices/`
- `src/lib/billing/`

## Tables
`Invoice`, `InvoiceLine`, `Payment`
