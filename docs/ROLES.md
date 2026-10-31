# Roles and permissions

Brightloop has three roles. Each page and server action checks the role at the top with a guard from `src/lib/auth.ts`:

- `requireAdmin()`: admins only.
- `requireTeam()`: admins and staff.
- `requireCustomer()`: customers only, and only their own records.

Hiding a button is never the only check. The server action behind it runs the same guard, so a staff member who posts to an admin action is redirected to `/dashboard`.

| Role | Home | What it is for |
| --- | --- | --- |
| Admin | `/dashboard`: **Admin dashboard** | Full control: catalog, prices, taxes, discounts, staff, settings and the revenue overview, plus everything staff can do. |
| Staff | `/dashboard`: **Staff dashboard** | Day-to-day work: approve signups, quote, confirm, invoice, record payments and chase overdue invoices. |
| Customer | `/portal` | Their own subscriptions, invoices, payments and profile, plus the catalog and quotation requests. |

## Permission matrix

"Own" means only the customer's own records. "—" means no access: the page redirects and the action is refused.

| Area | Admin | Staff | Customer |
| --- | --- | --- | --- |
| Products & variants | View · Create · Edit (incl. deactivate) · Delete variants | View | View active products on the public pricing page and under Portal → Products |
| Plans | View · Create · Edit (incl. deactivate) · Delete unused plans | View | View plans on sale on the public pricing page and under Portal → Products |
| Taxes | View · Create · Edit · Delete | — (can apply an active tax on a subscription line) | — |
| Discounts | View · Create · Edit · Delete | — (active rules apply on their own at billing: the run picks the one that saves the most) | — |
| Quotation templates | View · Create · Edit · Delete | View · Create · Edit · Delete | View as ready-made packages under Portal → Products, and start a request from one |
| Subscriptions & quotations | View · Create · Edit · Approve (send quotation, confirm) · pause/resume/renew/close | Same as admin | View own (not drafts, except their own requests) · Request a quotation (at most 3 open) · Withdraw own request while it is a draft · Edit own: pause, resume, renew, cancel when the plan allows it. Never confirms |
| Customer approvals | View · Approve · Delete (reject a pending signup) | View · Approve · Delete (reject a pending signup) | — (signs up, then waits for approval) |
| Invoices | View · Create (billing run) · Approve (confirm, incl. all drafts) · Edit (cancel) · send · print | Same as admin | View own invoices (not drafts) · print |
| Payments | View · Create (record a payment on an invoice) | View · Create (record a payment on an invoice) | View own · Create (pay own invoice in the portal) |
| Billing runs | View · Create (run billing now) | View · Create (run billing now) | — |
| Reports | View · CSV export | View · CSV export (the Reports page; the staff home itself shows no revenue totals) | — |
| Staff (team members) | View · Create (add staff) · Edit (switch Admin ↔ Staff, never their own role) | — | — |
| Settings | View · Edit | — | — |
| Own profile | Password reset only | Password reset only | View · Edit details · change password |

Where each rule lives:

- **Admin only (`requireAdmin`):** `products/actions.ts`, `products/new`, `plans/actions.ts`, `plans/new`, `taxes/*`, `discounts/*`, `users/*`, `settings/*`. The Products and Plans list and detail pages use `requireTeam` so staff can read them, and hide every create, edit, deactivate, delete and variant control unless `role === "ADMIN"`.
- **Team (`requireTeam`):** `customers/*`, `subscriptions/*` (incl. `status-actions.ts`), `templates/*`, `invoices/*` (incl. print), `payments`, `billing-runs`, `reports`, the dashboard home and layout. `reports/export/route.ts` checks for `ADMIN` or `STAFF` itself and returns 403 otherwise.
- **Customer (`requireCustomer`):** everything under `/portal`. Queries filter by the signed-in customer's id, so a customer can't open someone else's subscription or invoice.
- **Signed out:** the landing page, `/pricing`, login, signup and password reset. A customer who hasn't been approved yet counts as signed out everywhere.

## Main flow

1. **Admin sets up the catalog:** products and variants, plans, taxes, discounts, quotation templates and company settings, then adds staff on the Staff page. Customers are kept separate, on the Customers page.
2. **Customer signs up** at `/signup`. The account is created as pending and can't log in yet.
3. **Staff approve the signup** from the work queue on the Staff dashboard or from Customers → Pending. The customer gets an email and can now log in.
4. **Staff quote and confirm:** a new subscription starts as a draft, is sent as a quotation, then is confirmed once the customer agrees. A customer can also **request a quotation** from Portal → Products, from a ready-made package or from scratch. It arrives as a draft marked **Customer request**, priced from the catalog on the server, with a bubble on Subscriptions, a toast and a card in the staff work queue. Staff edit it and send it as a quotation as usual, and it stops counting as a request once it leaves Draft.
5. **Invoices are generated** by the billing run (scheduled, or "Run billing now"). Staff confirm the draft invoices, then send or print them.
6. **The customer pays** the invoice in the portal, or **staff record the payment** on the invoice. Overdue invoices show up in the staff work queue until they are paid.
