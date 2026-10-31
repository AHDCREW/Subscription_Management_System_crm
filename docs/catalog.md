# Part 2: Catalog

**Owner:** Farisebnuyousuf

Everything the admin sets up before anything can be sold.

## Scope
- **Products:** name, type (Software / Add-on / Service), sales price, cost price, notes, default tax
- **Variants:** attribute + value with an extra price (Brand = Odoo adds 560)
- **Plans:** price, billing period (daily / weekly / monthly / yearly), minimum quantity, available dates, and whether it auto-closes, can close early, pause or renew
- **Tax rules:** name and rate, applied automatically on invoices
- **Discounts (admin only):** fixed or percentage, minimum purchase or quantity, start and end dates, usage limit, specific products or whole subscription

## Folders
- `src/app/dashboard/{products,plans,taxes,discounts}`
- `src/lib/catalog/`

## Tables
`Product`, `ProductVariant`, `Plan`, `Tax`, `Discount`, `DiscountProduct`
