# SubFlow: Build Plan

**SubFlow** is a subscription management system built for **Brightloop Software**, following the hackathon brief *Subscription Management System* (Odoo).
It runs products, plans, subscriptions, recurring invoices, payments and revenue reporting in one app.

- **Hackathon:** 9:00 AM – 5:00 PM IST
- **Repo:** https://github.com/AHDCREW/Subscription_Management_System_crm
- **Stack:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Prisma 6 · **MySQL 8**
- **Third-party APIs:** none. Auth, billing, taxes, discounts and the payment checkout are all our own code.

---

## 1. The problem (from the brief)

| Area | Today | SubFlow fixes it by |
|---|---|---|
| Subscriptions | Tracked in a spreadsheet | One subscriptions table with a status everyone can see |
| Renewals | Remembered by whoever notices first | `nextInvoiceDate` on every subscription plus a billing run |
| Invoices | Typed by hand every month | Generated from the subscription, with lines, taxes and totals filled in |
| Payments | Matched against bank statements | Each payment recorded against its invoice; invoice status updates itself |
| Revenue reports | Built manually each quarter | A live dashboard with filters |

---

## 2. Roles and permissions

| Action | Admin | Staff | Customer |
|---|:-:|:-:|:-:|
| Sign up / log in / reset password | ✅ | ✅ | ✅ |
| Add staff members | ✅ | ❌ | ❌ |
| Create/edit products, variants, plans | ✅ | ❌ (view only) | ❌ |
| Create/edit tax rules | ✅ | ❌ | ❌ |
| Create/edit discount rules | ✅ | ❌ | ❌ |
| Create/edit quotation templates | ✅ | ✅ | ❌ |
| Create quotations / subscriptions, change status | ✅ | ✅ | ❌ |
| Accept / decline own quotation | ❌ | ❌ | ✅ |
| Pause / renew / close own subscription (if plan allows) | ✅ | ✅ | ✅ |
| Generate / confirm / cancel / send / print invoices | ✅ | ✅ | ❌ (view & print own) |
| Record payments | ✅ | ✅ | ❌ (Demo Pay own invoices) |
| Reports dashboard | ✅ | ✅ | ❌ |
| Company settings | ✅ | ❌ | ❌ |
| See other customers' data | ✅ | ✅ | ❌ never |

Every server action checks the role on the server, not only in the UI.

---

## 3. Requirements, scene by scene

Each line is a checkbox to test at the end.

### Scene 1: A new customer signs up
- [ ] Sign up with name, email and password.
- [ ] **One account per email** (unique index in MySQL plus a friendly error).
- [ ] Password must be **more than 8 characters** (9 or more), with **an uppercase letter, a lowercase letter and a special character**. A live checklist on the form shows which rules are met, and the server checks again.
- [ ] Passwords are stored as bcrypt hashes.
- [ ] Log in / log out with a session cookie (httpOnly; the session id is stored hashed in MySQL).
- [ ] **Forgot password:** the user enters an email and a reset link is "sent" to the registered email. The token expires in 30 minutes and works once. The link goes over SMTP if configured, otherwise it's printed to the server console.
- [ ] Three roles: **Admin** (everything), **Staff** (day-to-day work, limited), **Customer** (portal, own data only).
- [ ] **Only the admin can add staff.** Public signup always creates a Customer.

### Scene 2: Launching a new plan
- [ ] **Product:** name, type (Software / Add-on / Service), sales price, cost price, notes, default tax, active flag.
- [ ] **Variants:** attribute and value with an extra price. Seed **Brand = Odoo → +560**.
- [ ] Line price = product sales price + variant extra price.
- [ ] **Plan:** name, price, billing period (**daily / weekly / monthly / yearly**), **minimum quantity**, **available from/to dates**.
- [ ] Per-plan options: **auto-close when it ends**, **can close early**, **can pause**, **can renew**.
- [ ] A plan can't be used outside its availability dates, and line quantity must be at least the minimum quantity.

### Scene 3: Turning a quote into a subscription
- [ ] **Quotation template:** name, plan, product lines (product, variant, quantity), **validity in days**.
- [ ] Creating a subscription from a template copies the plan and lines, and sets `quotationExpiresAt = today + validityDays`.
- [ ] **Subscription:** auto **number** (`SUB-00001`), customer, plan, **start date**, **expiry date**, **payment terms** (days), salesperson, optional discount.
- [ ] **Lines:** product, variant, quantity, unit price, tax, **amount** (qty × unit price, plus tax shown).
- [ ] **Status flow:** `Draft → Quotation → Confirmed → Active → Closed` (plus `Paused` if the plan allows it).
- [ ] The status badge is visible on lists and the detail page, for **everyone on the team**.
- [ ] An expired quotation can't be confirmed.

### Scene 4: Billing day
- [ ] **"Run billing" button** (and a function a scheduled job can call): for every **Active** subscription with `nextInvoiceDate ≤ today`, create a **Draft** invoice.
- [ ] The invoice is built from the subscription: **customer details, product lines, taxes, discounts and totals filled in**.
- [ ] **Taxes calculated automatically** from the admin's tax rules (line tax = (line amount − line discount) × rate).
- [ ] **Never billed twice:** the MySQL unique key `(subscriptionId, periodStart)` plus a transaction. Re-running the billing run creates nothing new.
- [ ] **Never skipped:** after each invoice, `nextInvoiceDate` moves forward one period. A subscription several periods behind gets one invoice per missed period.
- [ ] Invoice actions: **Confirm, Cancel, Send** (marks `sentAt`, emails if SMTP is set), **Print** (print-friendly page, "Save as PDF").
- [ ] **Invoice status:** `Draft → Confirmed → Paid` (or `Cancelled`).
- [ ] Plans with **auto-close** close the subscription when `expiryDate` has passed.
- [ ] It must handle hundreds of subscriptions in one run (batched, in a transaction per subscription).

### Scene 5: A customer asks for a better price
- [ ] **Only the admin** creates discount rules.
- [ ] Type: **fixed amount** or **percentage**.
- [ ] Conditions: **minimum purchase** (amount) and/or **minimum quantity**, **start and end date**, **usage limit**.
- [ ] Scope: **specific products** or **whole subscription**.
- [ ] A discount attached to a subscription **appears automatically on the next invoice** as a discount amount.
- [ ] It **stops automatically** when past its end date or when `usedCount ≥ usageLimit` (`usedCount` goes up once per invoice it's applied to).

### Scene 6: The money comes in
- [ ] **Record a payment** against an invoice: **method** (cash, bank transfer, card, UPI, cheque, Demo Pay), **amount**, **date**, **note**.
- [ ] Partial payments allowed. `amountPaid` updates, and when it reaches the total the invoice becomes **Paid**.
- [ ] A payment can't exceed the balance due.
- [ ] Invoice list filters: **Paid / Outstanding / Overdue** (overdue = confirmed, not paid, `dueDate < today`).
- [ ] **Demo Pay:** the customer clicks "Pay now" on their invoice, sees a fake checkout (card/UPI) with success or failure, and the payment is recorded with a unique `reference`, so it's never recorded twice.

### Scene 7: The finance lead at month end
- [ ] **Dashboard summary:** active subscriptions, MRR (monthly recurring revenue), revenue collected, amount outstanding, overdue count and amount.
- [ ] **Reports with filters** (date range, status, customer, plan): subscriptions, invoices, payments, overdue invoices.
- [ ] A simple revenue chart for the last 6 months (plain SVG, no chart API).
- [ ] **Every page under 2 seconds with thousands of subscriptions:** indexes on status, customer, dates; paginated lists (25 per page); aggregates done in SQL (`count`, `sum`, `groupBy`), never by loading every row.
- [ ] Seed script with **2,000+ subscriptions** to prove it.

---

## 4. Data model (MySQL)

Defined in `prisma/schema.prisma`; the SQL is in `prisma/migrations/*/migration.sql`.

```
User ─┬─< Session
      ├─< PasswordResetToken
      ├─< Subscription (as customer) ─┬─< SubscriptionLine >── Product ─< ProductVariant
      │                               ├── Plan                   │
      │                               ├── QuotationTemplate ─< QuotationTemplateLine
      │                               ├── Discount ─< DiscountProduct >── Product
      │                               └─< Invoice ─┬─< InvoiceLine
      └─< Invoice (as customer)                    └─< Payment
Tax ─< Product, SubscriptionLine
CompanySettings (single row: Brightloop's name, address, GST no., currency)
```

Key rules enforced by the database:

| Rule | How |
|---|---|
| One account per email | `User.email @unique` |
| Unique subscription / invoice numbers | `Subscription.number`, `Invoice.number @unique` |
| No double billing | `Invoice @@unique([subscriptionId, periodStart])` |
| Payment never recorded twice | `Payment.reference @unique` |
| No duplicate variant | `ProductVariant @@unique([productId, attribute, value])` |
| Fast lists and reports | indexes on `status`, `customerId`, `nextInvoiceDate`, `dueDate`, `paymentDate`, `role` |
| Integrity | foreign keys with cascade or set-null where it makes sense |

Money is `DECIMAL(12,2)`, and tax rates are `DECIMAL(5,2)` percent.

---

## 5. Pages

### Public
| Route | Page |
|---|---|
| `/login` | Log in |
| `/signup` | Customer sign up with live password checklist |
| `/forgot-password` | Request reset link |
| `/reset-password?token=` | Set new password |

### Admin / Staff (`/dashboard/...`)
| Route | Page | Owner |
|---|---|---|
| `/dashboard` | Summary cards, revenue chart, overdue list | Core |
| `/dashboard/users` | Staff and customers; add staff (admin) | Core |
| `/dashboard/settings` | Company settings (admin) | Core |
| `/dashboard/products` (+ `/new`, `/[id]`) | Products and variants | Catalog |
| `/dashboard/plans` | Plans | Catalog |
| `/dashboard/taxes` | Tax rules | Catalog |
| `/dashboard/discounts` | Discount rules | Catalog |
| `/dashboard/templates` | Quotation templates | Subscriptions |
| `/dashboard/subscriptions` (+ `/new`, `/[id]`) | Subscriptions, lines, status actions | Subscriptions |
| `/dashboard/invoices` (+ `/[id]`, `/[id]/print`) | Invoices, billing run, actions | Billing |
| `/dashboard/payments` | Payments list, record payment | Billing |
| `/dashboard/reports` | Filters and reports | Core |

### Customer portal (`/portal/...`)
| Route | Page | Owner |
|---|---|---|
| `/portal` | Overview: active subs, next bill, unpaid invoices | Subscriptions |
| `/portal/subscriptions/[id]` | Detail; pause/renew/close if allowed | Subscriptions |
| `/portal/quotations/[id]` | Accept / decline | Subscriptions |
| `/portal/invoices/[id]` | Invoice, print, **Pay now (Demo Pay)** | Billing |
| `/portal/profile` | Edit details, change password | Core |

Branding: SubFlow on login, sidebar and footer. **Brightloop Software** (from Company settings) on invoices and the portal header, with "Powered by SubFlow".

---

## 6. Folder layout (who owns what)

```
prisma/schema.prisma, prisma/seed.ts          → Core (schema changes go through Core)
src/lib/db.ts, auth.ts, password.ts, mail.ts   → Core
src/lib/money.ts, src/components/ui/*          → Core (shared helpers & UI kit)
src/app/(auth)/*                               → Core
src/app/dashboard/{layout,page,users,settings,reports}  → Core
src/app/dashboard/{products,plans,taxes,discounts}      → Catalog
src/lib/catalog/*                                       → Catalog
src/app/dashboard/{templates,subscriptions}, src/app/portal/* (except invoices) → Subscriptions
src/lib/subscriptions/*                                 → Subscriptions
src/app/dashboard/{invoices,payments}, src/app/portal/invoices/*                → Billing
src/lib/billing/* (billing run, tax & discount calc, demo pay)                  → Billing
```

Separate folders mean the hourly PRs don't conflict.

---

## 7. Team split

| Part | GitHub | Scope |
|---|---|---|
| **1. Core** | AHDCREW | Setup, MySQL schema, auth (signup, login, reset), roles, add staff, layout, settings, dashboard, reports, seed, README |
| **2. Catalog** | Farisebnuyousuf | Products, variants, plans, taxes, discounts |
| **3. Subscriptions** | muhammedshafykm-ops | Quotation templates, subscriptions, lines, status flow, customer portal |
| **4. Billing** | rejanoorjahan-ship-it | Billing run, invoices, tax/discount application, invoice actions, print, payments, Demo Pay, overdue |

### Hourly schedule (one commit per person per hour)

| Round | Core | Catalog | Subscriptions | Billing |
|---|---|---|---|---|
| 9–11 ✅ | Setup + MySQL schema (done) | – | – | – |
| 11–12 | Auth: signup/login/logout, password rules | Products list + form | Quotation templates | Billing math lib (line, tax, discount, totals) |
| 12–1 | Forgot/reset password, dashboard layout | Variants (Odoo +560) | Subscription create (from template) | Billing run + no-double-billing |
| 1–2 | Roles, add staff, company settings | Plans (period, min qty, dates, options) | Status flow + subscription detail | Invoice list/detail, confirm/cancel/send |
| 2–3 | Dashboard summary + revenue chart | Tax rules | Customer portal: overview, subscriptions | Print view + record payments |
| 3–4 | Reports with filters, seed 2,000+ subs | Discounts (admin only, scope, limits) | Portal: accept/decline quote, pause/renew/close | Demo Pay + overdue tracking, discounts on invoices |
| 4–5 | Merge, README, ER diagram, perf check | Polish + validation | Polish | Polish |

---

## 8. Git workflow

1. Before each round, pull: `git checkout main && git pull`.
2. For each teammate, make a short branch from `main`, for example `faris/product-variants`.
3. Commit with that teammate's identity: their GitHub noreply email `<id>+<username>@users.noreply.github.com`.
   - Farisebnuyousuf → `86836746+Farisebnuyousuf@users.noreply.github.com`
   - muhammedshafykm-ops → `226169176+muhammedshafykm-ops@users.noreply.github.com`
   - rejanoorjahan-ship-it → `285463095+rejanoorjahan-ship-it@users.noreply.github.com`
4. **Before pushing, log in that teammate:** `gh auth switch -u <username>`. The first time, run `gh auth login`; the teammate approves the code at github.com/login/device. Check with `gh auth status`.
5. Push and open a PR from their account; AHDCREW reviews and merges.
6. Switch back: `gh auth switch -u AHDCREW`.

`rejanoorjahan-ship-it` must **accept the repo invite** before their first push.

---

## 9. Seed / demo data

- **Company:** Brightloop Software, GSTIN placeholder, INR.
- **Users:** `admin@brightloop.test` (Admin), `staff@brightloop.test` (Staff), 3 demo customers. All use the password `Demo@12345`.
- **Taxes:** GST 18%, GST 5%.
- **Products:**
  - Brightloop CRM (Software, ₹999; Brand variants Standard +0, **Odoo +560**)
  - Brightloop Accounting (Software, ₹1,499; Edition Basic/Pro +500)
  - Extra Storage 100 GB (Add-on, ₹199)
  - Priority Support (Add-on, ₹499)
  - Extra User Seat (Add-on, ₹149)
- **Plans:**
  - Monthly (₹0 base, monthly)
  - Yearly (yearly, can't pause)
  - Weekly Trial (weekly, auto-close)
  - Team Seats (monthly, min qty 5)
- **Discounts:** "10% off 10+ seats" (percentage, min qty 10, Extra User Seat only, limit 50), "₹500 launch offer" (fixed, whole subscription, ends in 30 days, limit 100).
- **Templates:** "Starter CRM" (CRM + Storage, 15 days), "Enterprise Yearly" (CRM Odoo + Accounting + 10 seats, 30 days).
- **Volume:** 2,000+ subscriptions across all statuses, 6 months of invoices and payments, some overdue.

---

## 10. Demo script (5 minutes)

1. Sign up as a new customer. Show the password rules failing, then passing. Show the duplicate email error.
2. Run forgot password and show the reset link arriving (console or email).
3. As admin: add a product with the Odoo variant (+560), then a plan with min qty and auto-close.
4. As staff: create a quotation from the template, send it, accept it as the customer in the portal, then confirm and activate it.
5. Admin creates a discount. Billing run generates invoices with tax and discount filled in. Run it again: **nothing billed twice**.
6. Confirm, send and print an invoice. Customer pays with Demo Pay; staff records a partial cash payment on another.
7. Open the dashboard: active subs, revenue, outstanding, overdue, then filters, all fast with 2,000+ subscriptions.

---

## 11. Open questions (defaults used until answered)

| # | Question | Default |
|---|---|---|
| 1 | Extra requirements from the hackathon video | PDF only |
| 2 | Part ownership above | As in section 7 |
| 3 | Teammate login method | Device-code `gh auth login`, then `gh auth switch` |
| 4 | Branch/PR flow | Short branch per feature, PR per hour |
| 5 | Missed 9–11 rounds | Start hourly from 11–12, no back-filling |
| 6 | ORM | Prisma (migration SQL committed) |
| 7 | Service name | SubFlow |
| 8 | Payments | Demo Pay + manual only |
| 9 | Reset emails | Console, SMTP optional |
| 10 | Per-person briefing docs | `docs/<username>.md` |
