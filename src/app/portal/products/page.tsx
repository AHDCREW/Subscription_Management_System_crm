import type { Metadata } from "next";
import { FileText, Send } from "lucide-react";
import { requireCustomer } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { productTypeInfo } from "@/lib/catalog/product-types";
import { PERIOD_LABEL, PERIOD_UNIT, estimateRecurringTotal, lineAmount } from "@/lib/subscriptions/templates";
import { formatDay, parseDateInput, todayUtc } from "@/lib/subscriptions/subscriptions";
import { Badge, ButtonLink, Card, EmptyState, PageHeader, SectionHeader } from "@/components/kit";
import { Stagger } from "@/components/motion";
import { getRequestCatalog, type CatalogVariant } from "./data";

export const metadata: Metadata = { title: "Products" };

// Groups variants by attribute: [["Brand", [Standard, Odoo]], …]
function groupVariants(variants: CatalogVariant[]) {
  const groups = new Map<string, CatalogVariant[]>();
  for (const v of variants) groups.set(v.attribute, [...(groups.get(v.attribute) ?? []), v]);
  return [...groups.entries()];
}

export default async function PortalProductsPage() {
  await requireCustomer();
  const { products, plans, templates } = await getRequestCatalog(todayUtc());
  const productsById = new Map(products.map((p) => [p.id, p]));
  const plansById = new Map(plans.map((p) => [p.id, p]));

  return (
    <>
      <PageHeader
        title="Products"
        description="What we sell, the plans on sale today and ready-made packages. Prices exclude tax."
        actions={
          <ButtonLink href="/portal/products/request">
            <Send aria-hidden /> Request a quotation
          </ButtonLink>
        }
      />

      <div className="space-y-10">
        <section>
          <SectionHeader
            title="Ready-made packages"
            description="A plan with its products already chosen. Start your request from one and change anything you like."
          />
          {templates.length === 0 ? (
            <EmptyState message="No packages right now. Build your own request instead." />
          ) : (
            <Stagger className="grid gap-4 md:grid-cols-2">
              {templates.map((template) => {
                const plan = plansById.get(template.planId)!;
                const lines = template.lines.flatMap((line) => {
                  const product = productsById.get(line.productId);
                  if (!product) return [];
                  const variant = product.variants.find((v) => v.id === line.variantId);
                  return [{ ...line, product, variant }];
                });
                const priced = lines.map((line) => ({
                  quantity: line.quantity,
                  salesPrice: line.product.salesPrice,
                  extraPrice: line.variant?.extraPrice,
                }));
                const unit = PERIOD_UNIT[plan.billingPeriod];
                return (
                  <Card key={template.id} className="flex flex-col gap-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                          <FileText className="size-4" aria-hidden />
                        </span>
                        <div>
                          <h3 className="font-semibold">{template.name}</h3>
                          <p className="text-xs text-muted-foreground">
                            {plan.name} plan · quote valid {template.validityDays} day{template.validityDays === 1 ? "" : "s"}
                          </p>
                        </div>
                      </div>
                      <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
                    </div>

                    <ul className="divide-y text-sm">
                      <li className="flex justify-between gap-4 py-2 first:pt-0">
                        <span className="text-muted-foreground">{plan.name} base fee</span>
                        <span className="tabular-nums">{formatMoney(plan.price)}</span>
                      </li>
                      {lines.map((line, index) => (
                        <li key={index} className="flex justify-between gap-4 py-2">
                          <span className="min-w-0">
                            {line.product.name}
                            {line.variant && <span className="text-muted-foreground"> · {line.variant.label}</span>}
                            <span className="text-muted-foreground tabular-nums"> × {line.quantity}</span>
                          </span>
                          <span className="tabular-nums">{formatMoney(lineAmount(priced[index]))}</span>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t pt-4">
                      <p className="text-sm">
                        <span className="text-2xl font-semibold tracking-tight tabular-nums">
                          {formatMoney(estimateRecurringTotal(plan.price, priced))}
                        </span>
                        <span className="text-muted-foreground"> / {unit} plus tax</span>
                      </p>
                      <ButtonLink href={`/portal/products/request?template=${template.id}`} variant="secondary">
                        Request this package
                      </ButtonLink>
                    </div>
                  </Card>
                );
              })}
            </Stagger>
          )}
        </section>

        <section>
          <SectionHeader title="Plans" description="The plan sets how often you're billed and its base price." />
          {plans.length === 0 ? (
            <EmptyState message="No plans are on sale right now." />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card key={plan.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
                  </div>
                  <p className="text-sm">
                    {plan.price > 0 ? (
                      <>
                        <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(plan.price)}</span>
                        <span className="text-muted-foreground"> / {PERIOD_UNIT[plan.billingPeriod]}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-semibold tracking-tight">No base fee</span>
                        <span className="text-muted-foreground"> · billed per {PERIOD_UNIT[plan.billingPeriod]}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Minimum quantity: <span className="tabular-nums text-foreground">{plan.minQuantity}</span> per product
                    {plan.endDate && <> · on sale until {formatDay(parseDateInput(plan.endDate))}</>}
                  </p>
                  {(plan.pausable || plan.renewable || plan.closable || plan.autoClose) && (
                    <div className="mt-auto flex flex-wrap gap-1.5 border-t pt-3">
                      {plan.pausable && <Badge tone="outline">Pause</Badge>}
                      {plan.renewable && <Badge tone="outline">Renew</Badge>}
                      {plan.closable && <Badge tone="outline">Close early</Badge>}
                      {plan.autoClose && <Badge tone="outline">Auto-closes</Badge>}
                    </div>
                  )}
                </Card>
              ))}
            </Stagger>
          )}
        </section>

        <section>
          <SectionHeader title="Products" description="Each product is billed every period on top of your plan's base fee." />
          {products.length === 0 ? (
            <EmptyState message="No products are on sale right now." />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {products.map((product) => (
                <Card key={product.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{product.name}</h3>
                    <Badge tone="outline">{productTypeInfo(product.type).label}</Badge>
                  </div>
                  <p className="text-sm">
                    {product.variants.length > 0 && <span className="text-muted-foreground">from </span>}
                    <span className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(product.salesPrice)}</span>
                    <span className="text-muted-foreground"> / period</span>
                  </p>
                  {product.notes && (
                    <p className="truncate text-sm text-muted-foreground" title={product.notes}>
                      {product.notes}
                    </p>
                  )}
                  {product.type === "ADDON" && (
                    <p className="text-xs text-muted-foreground">Switch it on or off yourself once your subscription is active.</p>
                  )}
                  {product.variants.length > 0 && (
                    <ul className="mt-auto space-y-1 border-t pt-3 text-xs text-muted-foreground">
                      {groupVariants(product.variants).map(([attribute, values]) => (
                        <li key={attribute}>
                          <span className="font-medium text-foreground">{attribute}:</span>{" "}
                          {values.map((v) => (v.extraPrice > 0 ? `${v.value} +${formatMoney(v.extraPrice)}` : v.value)).join(" · ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </Stagger>
          )}
        </section>

        <Card className="flex flex-wrap items-center justify-between gap-4 border-dashed bg-muted/30">
          <div>
            <h2 className="text-base font-semibold">Need something different?</h2>
            <p className="text-sm text-muted-foreground">
              Pick a plan and the products you want. Our team reviews your request and sends you a quotation.
            </p>
          </div>
          <ButtonLink href="/portal/products/request" variant="secondary">
            Build your own request
          </ButtonLink>
        </Card>
      </div>
    </>
  );
}
