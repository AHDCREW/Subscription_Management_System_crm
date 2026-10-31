# Brightloop judge demo (about 7 minutes)

This script follows the scenes in the hackathon brief, in order, with Brightloop's extras added along the way. Each step says who is logged in, what to click, and what to point out.

## Before you start

- **Public URL:** https://relock-sloppily-suffice.ngrok-free.dev. Free ngrok shows a one-time "Visit Site" warning page the first time. Click **Visit Site** once before the judges arrive.
- **Local URL:** http://localhost:3000
- Use two browser windows: a normal one for the team (admin, then staff) and a private one for customers, so both can stay logged in.
- Every account uses the password **`Demo@12345`**.

| Role | Email | Use it for |
|---|---|---|
| Admin | `admin@brightloop.test` | Catalog, discounts, Staff page, admin dashboard, reports |
| Staff | `staff@brightloop.test` (also `priya@brightloop.test`, `rahul@brightloop.test`) | Approvals, quotations, billing, payments |
| Customer | `customer@brightloop.test` | Kiran Stores: active monthly CRM (Odoo) with an unpaid invoice, a yearly Accounting Pro, an open quotation |
| Pending signups | `farah@inkwellstudio.test`, `tenzin@himalayantrails.test` | Signed up, waiting for approval, can't log in yet |

## Timeline

| Time | Scene |
|---|---|
| 0:00 | Landing page and login modal |
| 0:40 | 1. A new customer signs up, staff approve them |
| 1:50 | Admin dashboard vs staff dashboard |
| 2:30 | 2. Launching a plan (Odoo variant +₹560) |
| 3:20 | 3. Turning a quote into a subscription |
| 4:10 | 4. Billing day |
| 4:50 | 5. A customer asks for a better price (discounts) |
| 5:20 | 6. The money comes in (staff payment, customer pays with Demo Pay) |
| 6:20 | 7. The finance lead at month end (reports) |

## 0. Landing page and login modal (signed out)

1. Open `/`.
   - Brightloop logo, Odoo purple `#714B67`, highlighter yellow `#FBB130`, Caveat headings and Inter body text, all from the brief.
2. Scroll through **How it works**, **Your portal**, **Plans** and **FAQ**.
   - Plans and the "from" prices are read live from the catalog in MySQL, not hard-coded.
3. Click **Log in** in the header.
   - Login opens in a modal without leaving the page. `/login` still works for direct links.
4. Close the modal.

## 1. A new customer signs up

**Signed out (private window)**

1. Click **Sign up** (or **Create your account**). Fill in a name, an email and a weak password such as `abc`.
   - The live checklist shows the password rules: more than 8 characters, upper and lower case, a special character. The server checks the same rules.
2. Use a strong password and submit.
   - You land on "Account created, waiting for approval". Customers can't log in until the team approves them.
3. Open **Log in** and sign in as `farah@inkwellstudio.test`.
   - With the right password she sees "Your account is waiting for approval by our team…". With a wrong one she only sees "Incorrect email or password", so emails can't be probed.

**Staff (`staff@brightloop.test`, normal window)**

4. Log in. The staff dashboard opens at `/dashboard`.
   - The first card, **Customers waiting for approval**, lists the pending signups, oldest first.
5. Click **Review**, which opens **Customers → Waiting for approval** (`/dashboard/customers?tab=pending`). Click **Approve** on Farah.
   - The toast says she was approved and emailed. Without SMTP the email prints in the server log.
6. Optional: click **Reject** on Tenzin to show the confirm dialog. Rejecting removes a pending signup that has nothing billed to it.

**Customer (private window)**

7. Log in again as `farah@inkwellstudio.test`.
   - She now reaches the customer portal at `/portal`. It's empty until the team sends her a quotation.

## Admin dashboard vs staff dashboard

**Staff (normal window)**

1. Show the staff home: **Customers waiting for approval**, **Overdue invoices to chase**, **Draft invoices to confirm**, **Quotations awaiting confirmation**, **Subscriptions expiring soon**, **Payments recorded today**.
   - Staff see today's work queue, not company revenue. The sidebar has no Taxes, Discounts, Staff or Settings.
2. Click **Log out** next to your name at the bottom of the sidebar.

**Admin (`admin@brightloop.test`)**

3. Log in. The admin dashboard opens at `/dashboard`.
   - Active subscriptions, MRR, revenue this month, outstanding and overdue, a 6-month revenue chart, subscriptions by status and the **Setup** strip.
4. Click **Staff** at the bottom of the sidebar (`/dashboard/users`).
   - Team only: admins and staff. Only the admin can **Add staff** or switch a member between Admin and Staff. Customers live separately on **Customers**.

## 2. Launching a new plan

**Admin**

1. **Catalog → Products → Brightloop CRM**.
   - Sales price ₹999. In the variants card, Brand = Odoo adds **₹560** and the line price column shows ₹1,559.
   - The same variant can't be added twice: `(product, attribute, value)` is a unique key in MySQL.
2. **Catalog → Plans → New plan**. Show the fields: price, billing period (daily, weekly, monthly, yearly), minimum quantity, **Available from / Available until**, and the options (auto-close, close early, pause, renew). Click **Create plan**.
   - Example: the seeded **Team Seats** plan needs at least 5 units per line, and **Weekly Trial** auto-closes and is only on sale for a few weeks.

## 3. Turning a quote into a subscription

**Staff (or admin)**

1. **Sales → Quotation templates**. Open **Enterprise Yearly**.
   - A template holds a plan, product lines (CRM Odoo, Accounting Pro, 10 extra seats) and a validity of 30 days.
2. **Sales → Subscriptions → New subscription** (on the staff home: **New quotation / subscription**).
3. Under **Start from a template**, pick **Enterprise Yearly**. As **Customer**, pick Farah, who you just approved. Leave the start date as today. Click **Save as draft**.
   - Lines, variants, prices and tax are filled from the template. The number is `SUB-xxxxx`.
4. On the subscription, click **Send quotation**, then **Confirm**.
   - Status flow: Draft → Quotation → Confirmed → Active (Paused and Closed come later). An expired quotation can't be confirmed.

## 4. Billing day

**Staff**

1. **Billing → Invoices**. In the **Billing run** panel, click **Run billing now**.
   - The summary shows invoices created, activated, already billed, auto-closed and errors. Farah's confirmed subscription becomes **Active** and gets a draft invoice.
   - The same job runs by itself every day at 00:05 IST.
2. Click **Run billing now** again.
   - Nothing new is created: each period is billed once. MySQL enforces this with a unique key on `(subscriptionId, periodStart)`.
3. Open **Billing → Billing runs** to show the history of manual and scheduled runs.
4. Back on **Invoices**, click **Confirm all drafts** (or open one invoice and click **Confirm invoice**). Open an invoice and click **Print**.
   - The invoice shows each line with its discount and tax, plus Brightloop's GSTIN from Settings. Save as PDF from the print dialog.

## 5. A customer asks for a better price

**Admin**

1. **Catalog → Discounts**. Show **10% off 10+ seats** (Extra User Seat, minimum quantity 10, usage limit 50) and **₹500 launch offer** (whole subscription, with an end date and a usage limit of 100).
2. Click **New discount** to show the form: percentage or fixed, whole subscription or specific products, minimum purchase or quantity, start and end dates, usage limit.
   - Discounts are admin-only. The billing run applies exactly one discount per invoice, the one that saves the most, and stops once it passes its end date or its usage limit. The **Used** column counts how often each one has been applied.
3. Open the invoice from scene 4.
   - Farah's 10 seats qualify for the seat discount, so the **Discount** column shows it on the seat line. If the ₹500 launch offer has already started, that one wins because it saves more.

## 6. The money comes in

**Staff**

1. Open a confirmed invoice (Farah's, or one from **Overdue invoices to chase** on the staff home). Click **Record payment**, choose a method (cash, bank transfer, card, UPI or cheque) and enter part of the balance.
   - Partial payments are allowed. The invoice becomes **Paid** only when the amount paid reaches the total.
2. **Billing → Payments** shows the payment with who recorded it.

**Customer (`customer@brightloop.test`, private window)**

3. Log in. The portal **Overview** shows active subscriptions, the next bill and unpaid invoices for Kiran Stores.
4. **Subscriptions** → open the monthly CRM subscription. Under **Manage subscription**, click **Pause**, confirm, then **Resume**. On the yearly Accounting Pro subscription, click **Renew** and pick how long to renew for.
   - Customers can pause, resume, renew or cancel only when the plan allows it. The open quotation says the team confirms it.
5. **Invoices** → open the unpaid invoice → **Pay now**.
6. Pay by **Card** with `4242 4242 4242 4242` (any future expiry and CVC), or switch to **UPI** and use `success@subflow`.
   - This is Demo Pay, a built-in simulated checkout with no real gateway. Card `4000 0000 0000 0002` or UPI `failure@subflow` shows a declined payment.
7. On **Payment successful**, click **Print receipt** or **Back to invoice**.
   - The invoice is now Paid. The payment also shows up for staff under **Payments** and on the staff home.

## 7. The finance lead at month end

**Admin**

1. **Dashboard**: walk through MRR, revenue this month, outstanding, overdue and the revenue chart.
2. Click **Reports** (`/dashboard/reports`). Switch between **Subscriptions**, **Invoices**, **Payments** and **Overdue**. Filter by date, status, customer or plan.
   - Over 2,000 seeded subscriptions, about 6,500 invoices and 5,800 payments. Lists show 25 rows per page and totals are computed in SQL, so it stays fast.
3. Click **Export CSV**.
   - The export uses the same filters as the screen.

Close with: one app for catalog, quotations, subscriptions, billing, payments and reporting, with no third-party APIs, and the key rules enforced in MySQL.

## If something goes wrong

- **No email arrives.** SMTP isn't configured, so password reset and approval emails are printed to the terminal running `npm run dev`. Copy the reset link from there.
- **The app hangs or shows an error.** Stop the dev server with `Ctrl+C` and start it again with `npm run dev`. If MySQL is down, run `docker compose up -d` (or `colima start` first on macOS) and restart the server.
- **The public URL stops working.** Restart ngrok against port 3000 (the URL may change), or demo on http://localhost:3000.
- **Demo data is missing.** Run `npm run db:seed`. It is safe to run again: base records are upserted, and the bulk data is skipped once there are 2,000 or more subscriptions.
- **A pending customer was already approved.** Sign up a new customer from `/signup` and approve that one instead.
