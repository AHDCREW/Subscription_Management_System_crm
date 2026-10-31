import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { productTypeInfo } from "@/lib/catalog/product-types";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { todayUtc } from "@/lib/subscriptions/subscriptions";
import { Badge, ButtonLink, Card, EmptyState, SectionHeader, cx } from "@/components/kit";
import { FadeIn, Stagger } from "@/components/motion";
import BlurText from "@/components/reactbits/BlurText";

export const metadata: Metadata = { title: "Plans & pricing" };

const FAQ = [
  {
    q: "How does billing work?",
    a: "You're invoiced in advance at the start of each billing period: monthly plans every month, yearly plans once a year. Your plan's base price is added to the products you choose.",
  },
  {
    q: "Are taxes included?",
    a: "Prices shown here exclude tax. Applicable taxes, such as GST, are added on top and shown line by line on every invoice.",
  },
  {
    q: "How do I pay?",
    a: "Each invoice appears in your customer portal as soon as it's issued. Open it to see the amount and due date, pay online with card or UPI, or print it as a PDF.",
  },
];

// Groups variants by attribute: [["Brand", [{ value: "Standard", extraPrice }, …]], …]
function groupVariants<T extends { attribute: string }>(variants: T[]) {
  const groups = new Map<string, T[]>();
  for (const v of variants) groups.set(v.attribute, [...(groups.get(v.attribute) ?? []), v]);
  return [...groups.entries()];
}

export default async function PricingPage() {
  const today = todayUtc();
  const [user, company, products, plans] = await Promise.all([
    getCurrentUser(),
    db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } }),
    db.product.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      include: { variants: { orderBy: [{ attribute: "asc" }, { extraPrice: "asc" }, { value: "asc" }] } },
    }),
    db.plan.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: today } }] },
          { OR: [{ endDate: null }, { endDate: { gte: today } }] },
        ],
      },
      orderBy: [{ price: "asc" }, { name: "asc" }],
    }),
  ]);
  const companyName = company?.name ?? "Brightloop Software";

  return (
    <div className="min-h-screen p-2.5">
      <div className="flex min-h-[calc(100vh-1.25rem)] flex-col rounded-2xl border bg-card shadow-xs">
      <header className="border-b animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-3">
          <div>
            <p className="text-base font-semibold tracking-tight">{companyName}</p>
            <p className="text-xs text-muted-foreground">Powered by SubFlow</p>
          </div>
          <nav className="flex items-center gap-2">
            {user ? (
              <ButtonLink href={homeFor(user.role)}>
                {user.role === "CUSTOMER" ? "Go to portal" : "Go to dashboard"}
              </ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost">
                  Log in
                </ButtonLink>
                <ButtonLink href="/signup">Create account</ButtonLink>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-12 px-6 py-10">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">
            <BlurText text="Plans & pricing" animateBy="words" direction="top" trigger="load" stepDuration={0.25} distance={12} blur={6} />
          </h1>
          <p className="mt-2 text-sm text-muted-foreground animate-in fade-in duration-700">
            Pick the products you need and a billing plan that suits you. Create an account to get a quotation from{" "}
            {companyName}.
          </p>
        </div>

        <section>
          <SectionHeader title="Products" description="Each product is billed every period on top of your plan's base price." />
          {products.length === 0 ? (
            <EmptyState message="No products are on sale right now." />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2">
              {products.map((p) => (
                <Card key={p.id} className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{p.name}</h3>
                    <Badge tone="outline">{productTypeInfo(p.type).label}</Badge>
                  </div>
                  <p className="text-sm">
                    <span className="text-muted-foreground">from </span>
                    <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(p.salesPrice)}</span>
                    <span className="text-muted-foreground"> / period</span>
                  </p>
                  {p.notes && <p className="truncate text-sm text-muted-foreground" title={p.notes}>{p.notes}</p>}
                  {p.variants.length > 0 && (
                    <ul className="mt-auto space-y-1 border-t pt-3 text-xs text-muted-foreground">
                      {groupVariants(p.variants).map(([attribute, values]) => (
                        <li key={attribute}>
                          <span className="font-medium text-foreground">{attribute}:</span>{" "}
                          {values
                            .map((v) =>
                              Number(v.extraPrice) > 0 ? `${v.value} +${formatMoney(v.extraPrice)}` : v.value,
                            )
                            .join(" · ")}
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </Stagger>
          )}
        </section>

        <section>
          <SectionHeader title="Plans" description="The plan sets how often you're billed and its base price." />
          {plans.length === 0 ? (
            <EmptyState message="No plans are available right now." />
          ) : (
            <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.id}
                  className={cx(
                    "flex flex-col gap-3",
                    plan.billingPeriod === "YEARLY" &&
                      "border-primary bg-[linear-gradient(160deg,oklch(0.33_0.006_286),oklch(0.17_0.006_286)_70%)] text-primary-foreground shadow-md [&_.text-muted-foreground]:text-primary-foreground/65 [&_.text-foreground]:text-primary-foreground [&_.border-t]:border-white/15",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
                  </div>
                  <p className="text-sm">
                    {Number(plan.price) > 0 ? (
                      <>
                        <span className="text-3xl font-semibold tracking-tight tabular-nums">{formatMoney(plan.price)}</span>
                        <span className="text-muted-foreground"> / {PERIOD_UNIT[plan.billingPeriod]}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-3xl font-semibold tracking-tight">No base fee</span>
                        <span className="text-muted-foreground"> · billed per {PERIOD_UNIT[plan.billingPeriod]}</span>
                      </>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Minimum quantity: <span className="tabular-nums text-foreground">{plan.minQuantity}</span>
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

        <FadeIn delay={0.2}>
          <section>
            <SectionHeader title="Questions" />
            <Card className="divide-y p-0">
              {FAQ.map((item) => (
                <div key={item.q} className="p-6">
                  <h3 className="text-sm font-semibold">{item.q}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{item.a}</p>
                </div>
              ))}
            </Card>
          </section>
        </FadeIn>
      </main>

      <footer className="pb-8 text-center text-xs text-muted-foreground">
        {companyName} · Powered by SubFlow
      </footer>
      </div>
    </div>
  );
}
