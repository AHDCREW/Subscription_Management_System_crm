import Link from "next/link";
import type { BillingPeriod } from "@prisma/client";
import {
  ArrowRight,
  CalendarClock,
  ChevronDown,
  CircleCheck,
  CirclePause,
  CreditCard,
  FileText,
  Lock,
  Printer,
  Receipt,
  Scale,
  UserPlus,
  UserRoundCheck,
  UserCog,
} from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PERIOD_LABEL, PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { todayUtc } from "@/lib/subscriptions/subscriptions";
import { Badge, ButtonLink, cx } from "@/components/kit";
import { Brand, RootSymbol, RootWordmark } from "@/components/brand";
import { FadeIn, Reveal } from "@/components/motion";
import { CircuitPattern } from "./_landing/circuit-pattern";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#portal", label: "Your portal" },
  { href: "#plans", label: "Plans" },
  { href: "#faq", label: "FAQ" },
];

const PORTAL_FEATURES = [
  { icon: CalendarClock, title: "Every subscription at a glance", body: "See each plan, its products, the current period and when the next invoice is due." },
  { icon: CirclePause, title: "Pause, resume or renew", body: "Take a break or extend your term from the portal, whenever your plan allows it." },
  { icon: Receipt, title: "Clear invoices", body: "Every line, discount and tax is listed separately, so you always know what you're paying for." },
  { icon: CreditCard, title: "Pay online in seconds", body: "Pay any open invoice by card or UPI and get a receipt straight away." },
  { icon: Printer, title: "PDF copies for your records", body: "Print or save any invoice as a PDF for your accounts team." },
  { icon: UserCog, title: "Your details, your control", body: "Keep your company name, billing address, phone and password up to date." },
];

const ASSURANCES = [
  { icon: Lock, title: "Approved accounts only", body: "Our team checks every new account before it can see plans, invoices or payments." },
  { icon: Scale, title: "Never billed twice", body: "Each period is invoiced exactly once, so nothing is missed or charged twice." },
  { icon: FileText, title: "Tax shown line by line", body: "GST and other taxes are added on top and shown on every invoice." },
];

export default async function Home() {
  const today = todayUtc();
  const [user, company, available, products] = await Promise.all([
    getCurrentUser(),
    db.companySettings.findUnique({ where: { id: 1 }, select: { name: true } }),
    // Same rule as the pricing page: active and within its sale dates.
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
    db.product.findMany({ where: { active: true }, select: { name: true, type: true, salesPrice: true }, orderBy: { salesPrice: "asc" } }),
  ]);
  const companyName = company?.name ?? "Brightloop Software";
  const home = user ? homeFor(user.role) : null;

  // Only the standard plans, one per billing period. Time-limited trials and multi-seat plans
  // are offered by our team in a quotation, so they stay on the full pricing page.
  const periods = new Set<BillingPeriod>();
  const plans = available.filter(
    (p) => !p.endDate && p.minQuantity <= 1 && !periods.has(p.billingPeriod) && periods.add(p.billingPeriod),
  );
  const featured = plans.find((p) => p.billingPeriod === "YEARLY") ?? plans.at(-1);
  // Plans here often have no base fee, so lead with the cheapest main product (add-ons are extras).
  const mainProduct = products.find((p) => p.type !== "ADDON") ?? products[0];
  const fromPrice = mainProduct ? Number(mainProduct.salesPrice) : 0;

  const steps = [
    {
      icon: UserPlus,
      title: "Create your account",
      body: "Sign up with your name, email and a password. It takes about a minute.",
    },
    {
      icon: UserRoundCheck,
      title: "We approve it",
      body: `Only ${companyName}'s admins and staff can approve accounts. We'll email you as soon as yours is ready.`,
    },
    {
      icon: Receipt,
      title: "We set up your billing",
      body: "Our team prepares your quotation, confirms your plan and invoices you automatically every period.",
    },
    {
      icon: CreditCard,
      title: "Pay and manage online",
      body: "Log in to your portal to pay invoices, download PDFs and pause or renew your subscription.",
    },
  ];

  const faq = [
    {
      q: "Who approves my account?",
      a: `${companyName}'s admins and sales staff. Customers can't approve themselves or each other, which keeps your billing details private.`,
    },
    {
      q: "Can I log in before my account is approved?",
      a: "Not yet. Once it's approved you'll get an email, and from then on you can log in with the email and password you signed up with.",
    },
    {
      q: "How do I start a subscription?",
      a: "After approval, our team sends you a quotation for the plan and products you need. Once it's confirmed, your subscription starts and invoices are issued automatically.",
    },
    {
      q: "How and when am I billed?",
      a: "You're invoiced at the start of each billing period: monthly plans every month, yearly plans once a year. Each invoice appears in your portal, where you can pay it by card or UPI.",
    },
    {
      q: "Are taxes included in the prices?",
      a: "Prices exclude tax. Applicable taxes such as GST are added on top and shown line by line on every invoice.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="ROOT home" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Brand />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {home ? (
              <ButtonLink href={home}>{user?.role === "CUSTOMER" ? "Go to portal" : "Go to dashboard"}</ButtonLink>
            ) : (
              <>
                <ButtonLink href="/login" variant="ghost">
                  Log in
                </ButtonLink>
                <ButtonLink href="/signup" className="hidden sm:inline-flex">
                  Create account
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative isolate overflow-hidden bg-navy text-white">
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(60%_80%_at_15%_110%,rgb(0_119_200/0.55),transparent_70%),radial-gradient(40%_60%_at_95%_-10%,rgb(140_196_238/0.18),transparent_70%)]"
          />
          <CircuitPattern className="-z-10 text-soft-blue/15" />
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.05fr_1fr] lg:py-28">
            <FadeIn>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-soft-blue">
                <span className="size-1.5 rounded-full bg-soft-blue" aria-hidden />
                Customer portal for {companyName}
              </p>
              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
                Where your <span className="text-soft-blue">subscriptions</span> grow.
              </h1>
              <p className="mt-5 max-w-xl text-base text-pretty text-white/75 sm:text-lg">
                Your plans, invoices and payments with {companyName}, all in one place. Create an account, get approved by
                our team, and manage everything from your own portal.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {home ? (
                  <ButtonLink href={home} className="h-11 bg-electric px-5 text-base text-white hover:bg-electric/90">
                    {user?.role === "CUSTOMER" ? "Open your portal" : "Open the dashboard"} <ArrowRight />
                  </ButtonLink>
                ) : (
                  <ButtonLink href="/signup" className="h-11 bg-electric px-5 text-base text-white hover:bg-electric/90">
                    Create your account <ArrowRight />
                  </ButtonLink>
                )}
                <ButtonLink
                  href="/pricing"
                  variant="secondary"
                  className="h-11 border-white/25 bg-white/5 px-5 text-base text-white hover:bg-white/10 hover:text-white"
                >
                  See plans &amp; pricing
                </ButtonLink>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/70">
                {["Free to sign up", "Approved by our team", "Pay by card or UPI"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <CircleCheck className="size-4 text-soft-blue" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </FadeIn>

            <FadeIn delay={0.2} className="relative mx-auto w-full max-w-md lg:max-w-none">
              <PortalPreview
                productName={mainProduct?.name ?? "Business plan"}
                price={formatMoney(fromPrice || 999)}
                companyName={companyName}
              />
            </FadeIn>
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="scroll-mt-16 border-b bg-canvas/50">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionIntro
              eyebrow="How it works"
              title="From sign-up to your first invoice"
              body="Accounts and billing are handled by our team, so you only need to sign up and pay."
            />
            <Reveal className="relative mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <div key={step.title} className="relative rounded-xl border bg-card p-6 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                      <step.icon className="size-5" aria-hidden />
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                  {i < steps.length - 1 && (
                    // Circuit connector to the next step (desktop only).
                    <span aria-hidden className="absolute top-11 -right-6 hidden h-px w-6 bg-brand/40 lg:block">
                      <span className="absolute -right-1 -top-1 size-2 rounded-full border-2 border-brand bg-card" />
                    </span>
                  )}
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Portal features */}
        <section id="portal" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionIntro
              eyebrow="Your portal"
              title="Everything about your account in one place"
              body="After approval, your portal shows exactly what you're subscribed to, what you owe and what you've paid."
            />
            <Reveal className="mt-12 grid gap-px overflow-hidden rounded-2xl border bg-border sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
              {PORTAL_FEATURES.map((f) => (
                <div key={f.title} className="group bg-card p-6 transition-colors hover:bg-secondary/60">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{f.body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Plans */}
        {plans.length > 0 && (
          <section id="plans" className="scroll-mt-16 border-y bg-canvas/50">
            <div className="mx-auto max-w-6xl px-6 py-20">
              <SectionIntro
                eyebrow="Plans"
                title="Monthly or yearly, you choose"
                body="Your plan sets how often you're billed. The products you choose are added on top."
              />
              <Reveal
                className={cx("mx-auto mt-12 grid gap-6", plans.length >= 3 ? "md:grid-cols-3" : "max-w-3xl md:grid-cols-2")}
              >
                {plans.map((plan) => {
                  const isFeatured = plan.id === featured?.id;
                  return (
                    <div
                      key={plan.id}
                      className={cx(
                        "relative flex flex-col rounded-2xl border bg-card p-6 shadow-xs",
                        isFeatured && "border-primary bg-[linear-gradient(160deg,#1b3b66,#102a4d_70%)] text-white shadow-lg",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold">{plan.name}</h3>
                        {isFeatured ? (
                          <span className="rounded-full bg-electric px-2.5 py-0.5 text-xs font-medium text-white">Best value</span>
                        ) : (
                          plan.name !== PERIOD_LABEL[plan.billingPeriod] && <Badge tone="outline">{PERIOD_LABEL[plan.billingPeriod]}</Badge>
                        )}
                      </div>
                      <p className="mt-5">
                        <span className={cx("text-sm", isFeatured ? "text-white/65" : "text-muted-foreground")}>from </span>
                        <span className="font-heading text-4xl font-semibold tracking-tight tabular-nums">
                          {formatMoney(Number(plan.price) + fromPrice)}
                        </span>
                        <span className={cx("text-sm", isFeatured ? "text-white/65" : "text-muted-foreground")}>
                          {" "}
                          / {PERIOD_UNIT[plan.billingPeriod]}
                        </span>
                      </p>
                      <p className={cx("mt-1 text-xs", isFeatured ? "text-white/60" : "text-muted-foreground")}>
                        {Number(plan.price) > 0
                          ? `${formatMoney(plan.price)} base fee plus your products`
                          : "No base fee: you only pay for your products"}
                      </p>
                      <ul className={cx("mt-6 space-y-2.5 text-sm", isFeatured ? "text-white/80" : "text-muted-foreground")}>
                        <li className="flex gap-2">
                          <CircleCheck className={cx("size-4 shrink-0 translate-y-0.5", isFeatured ? "text-soft-blue" : "text-brand")} aria-hidden />
                          Billed every {PERIOD_UNIT[plan.billingPeriod]}
                        </li>
                        {plan.pausable && <PlanPerk featured={isFeatured}>Pause when you need a break</PlanPerk>}
                        {plan.renewable && <PlanPerk featured={isFeatured}>Renew from your portal</PlanPerk>}
                        {plan.closable && <PlanPerk featured={isFeatured}>Close early at any time</PlanPerk>}
                        {plan.minQuantity > 1 && <PlanPerk featured={isFeatured}>Minimum quantity: {plan.minQuantity}</PlanPerk>}
                      </ul>
                      <div className="mt-auto pt-8">
                        <ButtonLink
                          href={home ?? "/signup"}
                          variant={isFeatured ? "primary" : "secondary"}
                          className={cx("w-full", isFeatured && "bg-electric text-white hover:bg-electric/90")}
                        >
                          {home ? "Open your account" : "Get started"}
                        </ButtonLink>
                      </div>
                    </div>
                  );
                })}
              </Reveal>
              <p className="mt-8 text-center text-sm text-muted-foreground">
                Looking for trials, team plans or add-ons?{" "}
                <Link href="/pricing" className="font-medium text-brand underline-offset-4 hover:underline">
                  See full pricing
                </Link>
              </p>
            </div>
          </section>
        )}

        {/* Assurances */}
        <section>
          <div className="mx-auto max-w-6xl px-6 py-20">
            <SectionIntro eyebrow="Billing you can trust" title="Secure by design, accurate every period" />
            <Reveal className="mt-12 grid gap-6 md:grid-cols-3">
              {ASSURANCES.map((a) => (
                <div key={a.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full border bg-card text-primary shadow-xs">
                    <a.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{a.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{a.body}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-t bg-canvas/50">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1fr_1.6fr]">
            <SectionIntro
              eyebrow="FAQ"
              title="Questions, answered"
              body={`Can't find what you need? Contact ${companyName}'s team and we'll help.`}
              align="left"
            />
            <div className="divide-y rounded-2xl border bg-card shadow-xs">
              {faq.map((item, i) => (
                <details key={item.q} className="group px-6" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 font-medium [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <p className="-mt-1 pb-5 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="px-6 py-20">
          <div className="relative isolate mx-auto max-w-6xl overflow-hidden rounded-3xl bg-navy px-6 py-16 text-center text-white sm:px-12">
            <div
              aria-hidden
              className="absolute inset-0 -z-10 bg-[radial-gradient(50%_90%_at_50%_120%,rgb(0_119_200/0.6),transparent_70%)]"
            />
            <CircuitPattern className="-z-10 text-soft-blue/10" />
            <RootSymbol variant="reversed" className="mx-auto size-14" />
            <h2 className="mx-auto mt-6 max-w-2xl text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Ready to get started with {companyName}?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">
              Create your account today. Our team will approve it and set up your subscription.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {home ? (
                <ButtonLink href={home} className="h-11 bg-electric px-5 text-base text-white hover:bg-electric/90">
                  Go to your account <ArrowRight />
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/signup" className="h-11 bg-electric px-5 text-base text-white hover:bg-electric/90">
                    Create your account <ArrowRight />
                  </ButtonLink>
                  <ButtonLink
                    href="/login"
                    variant="secondary"
                    className="h-11 border-white/25 bg-white/5 px-5 text-base text-white hover:bg-white/10 hover:text-white"
                  >
                    I already have an account
                  </ButtonLink>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-3">
            <RootSymbol className="size-6" />
            <span>
              {companyName} · Powered by <RootWordmark className="inline h-2.5 w-auto -translate-y-px text-primary" />
            </span>
          </div>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Create account
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  body?: string;
  align?: "center" | "left";
}) {
  return (
    <div className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <p className="font-mono text-xs font-medium tracking-widest text-brand uppercase">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {body && <p className="mt-4 text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

function PlanPerk({ featured, children }: { featured: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CircleCheck className={cx("size-4 shrink-0 translate-y-0.5", featured ? "text-soft-blue" : "text-brand")} aria-hidden />
      {children}
    </li>
  );
}

// Illustration of the customer portal: a subscription card, recent invoices and the approval notice.
function PortalPreview({ productName, price, companyName }: { productName: string; price: string; companyName: string }) {
  return (
    <div className="relative" aria-hidden>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-electric/20 blur-3xl" />
      <div className="rounded-2xl border border-white/10 bg-white p-5 text-foreground shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <RootSymbol className="size-7" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{companyName}</p>
              <p className="text-xs text-muted-foreground">Customer portal</p>
            </div>
          </div>
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">AK</span>
        </div>

        <div className="mt-4 rounded-xl bg-[linear-gradient(160deg,#1b3b66,#102a4d_70%)] p-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-xs text-white/60">Your subscription</p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium">
              <span className="size-1.5 rounded-full bg-success" /> Active
            </span>
          </div>
          <p className="mt-2 font-heading text-lg font-semibold">{productName}</p>
          <p className="mt-0.5 text-sm text-white/70">
            <span className="font-heading text-2xl font-semibold text-white tabular-nums">{price}</span> / month · Monthly plan
          </p>
          <div className="mt-4">
            <div className="flex justify-between text-xs text-white/60">
              <span>Current period</span>
              <span className="font-mono">18 of 30 days</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-3/5 rounded-full bg-linear-to-r from-electric to-soft-blue" />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Recent invoices</p>
          {[
            { no: "INV-00043", note: "Due in 5 days", status: "Open" },
            { no: "INV-00042", note: "Paid by UPI", status: "Paid" },
          ].map((inv) => (
            <div key={inv.no} className="flex items-center justify-between rounded-lg border px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <FileText className="size-4 text-muted-foreground" />
                <div className="leading-tight">
                  <p className="font-mono text-xs font-medium">{inv.no}</p>
                  <p className="text-xs text-muted-foreground">{inv.note}</p>
                </div>
              </div>
              {inv.status === "Open" ? (
                <span className="rounded-md bg-electric px-2.5 py-1 text-xs font-medium text-white">Pay now</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" /> Paid
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-14 -left-4 hidden items-center gap-3 rounded-xl border bg-white px-4 py-3 text-foreground shadow-xl sm:flex">
        <span className="flex size-8 items-center justify-center rounded-full bg-success/10 text-success">
          <UserRoundCheck className="size-4" />
        </span>
        <div className="leading-tight">
          <p className="text-sm font-medium">Account approved</p>
          <p className="text-xs text-muted-foreground">by the {companyName} team</p>
        </div>
      </div>
    </div>
  );
}
