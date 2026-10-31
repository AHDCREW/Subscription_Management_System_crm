import Link from "next/link";
import type { BillingPeriod } from "@prisma/client";
import { ArrowRight, CalendarClock, ChevronDown, CircleCheck, CirclePause, CreditCard, FileText, Lock, Receipt, Scale, UserRoundCheck } from "lucide-react";
import { db } from "@/lib/db";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { PERIOD_UNIT } from "@/lib/subscriptions/templates";
import { todayUtc } from "@/lib/subscriptions/subscriptions";
import { ButtonLink, cx } from "@/components/kit";
import { Brand, BrightloopMark } from "@/components/brand";
import { FadeIn, Reveal } from "@/components/motion";
import { LoginDialog } from "./_landing/login-dialog";

const NAV = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#portal", label: "Your portal" },
  { href: "#plans", label: "Plans" },
  { href: "#faq", label: "FAQ" },
];

// Six things customers care about, in one grid: what they see, what they can do, and why they can trust it.
const FEATURES = [
  { icon: CalendarClock, title: "Subscriptions at a glance", body: "Every plan, its products and the date of your next invoice." },
  { icon: CirclePause, title: "Pause, resume or renew", body: "Change your subscription yourself whenever your plan allows it." },
  { icon: CreditCard, title: "Pay online", body: "Pay open invoices by card or UPI and get a receipt straight away." },
  { icon: Receipt, title: "Clear invoices", body: "Every line, discount and tax listed separately. Print or save as PDF." },
  { icon: Scale, title: "Never billed twice", body: "Each billing period is invoiced exactly once, automatically." },
  { icon: Lock, title: "Approved accounts only", body: "Our team checks every new account before it sees any billing data." },
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
    { title: "Create your account", body: "Sign up with your name, email and a password." },
    { title: "We approve it", body: `${companyName}'s team checks your account and emails you when it's ready.` },
    { title: "We set up billing", body: "We send a quotation, confirm your plan and invoice you every period." },
    { title: "Pay and manage", body: "Pay invoices and manage your subscription from your portal." },
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
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-6">
          <Link href="/" aria-label="Brightloop home" className="rounded-md focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <Brand />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
                <LoginDialog />
                <ButtonLink href="/signup">Sign up</ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        {/* Hero: one message, one primary action, one picture. */}
        <section className="bg-linear-to-b from-accent/70 to-background">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-16 pb-24 lg:grid-cols-2 lg:pt-24 lg:pb-32">
            <FadeIn>
              <p className="text-sm font-medium text-primary">Customer portal for {companyName}</p>
              <h1 className="mt-4 font-display text-6xl leading-[0.95] font-bold text-balance sm:text-7xl">
                Where your <span className="marker">subscriptions</span> grow.
              </h1>
              <p className="mt-6 max-w-md text-lg text-pretty text-muted-foreground">
                Plans, invoices and payments in one place. Sign up, get approved by our team, and manage everything from
                your portal.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
                <ButtonLink href={home ?? "/signup"} className="h-11 px-5 text-base">
                  {home ? (user?.role === "CUSTOMER" ? "Open your portal" : "Open the dashboard") : "Create your account"} <ArrowRight />
                </ButtonLink>
                <Link href="/pricing" className="text-sm font-medium text-foreground underline-offset-4 hover:underline">
                  See pricing
                </Link>
              </div>
              <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Free to sign up", "Approved by our team", "Card or UPI"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <CircleCheck className="size-4 text-primary" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </FadeIn>

            <FadeIn delay={0.15} className="mx-auto w-full max-w-md lg:mr-0">
              <PortalPreview productName={mainProduct?.name ?? "Business plan"} price={formatMoney(fromPrice || 999)} companyName={companyName} />
            </FadeIn>
          </div>
        </section>

        {/* How it works: a numbered stepper. */}
        <section id="how-it-works" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionIntro title="How it works" body="Four steps from sign-up to your first invoice. Our team handles the billing." />
            <Reveal className="mt-14 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
              {steps.map((step, i) => (
                <div key={step.title} className="relative">
                  {i < steps.length - 1 && (
                    <span aria-hidden className="absolute top-5 left-14 hidden h-px w-[calc(100%-3rem)] bg-border lg:block" />
                  )}
                  <span className="flex size-10 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Portal features. */}
        <section id="portal" className="scroll-mt-20 border-y bg-muted/40">
          <div className="mx-auto max-w-6xl px-6 py-24">
            <SectionIntro title="Everything in your portal" body="See what you're subscribed to, what you owe and what you've paid." />
            <Reveal className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3" stagger={0.05}>
              {FEATURES.map((f) => (
                <div key={f.title} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-card text-primary shadow-xs ring-1 ring-border">
                    <f.icon className="size-5" aria-hidden />
                  </span>
                  <div>
                    <h3 className="font-semibold">{f.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Plans. */}
        {plans.length > 0 && (
          <section id="plans" className="scroll-mt-20">
            <div className="mx-auto max-w-6xl px-6 py-24">
              <SectionIntro title="Simple plans" body="Choose how often you're billed. The products you pick are added on top." />
              <Reveal className={cx("mx-auto mt-14 grid gap-6", plans.length >= 3 ? "md:grid-cols-3" : "max-w-3xl md:grid-cols-2")}>
                {plans.map((plan) => {
                  const isFeatured = plan.id === featured?.id;
                  return (
                    <div
                      key={plan.id}
                      className={cx(
                        "flex flex-col rounded-2xl border bg-card p-7",
                        isFeatured && "border-primary bg-[linear-gradient(160deg,#7d5573,#4f3149_70%)] text-white shadow-lg",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="font-semibold">{plan.name}</h3>
                        {isFeatured && <span className="rounded-full bg-sun px-2.5 py-0.5 text-xs font-semibold text-foreground">Best value</span>}
                      </div>
                      <p className="mt-6">
                        <span className={cx("text-sm", isFeatured ? "text-white/65" : "text-muted-foreground")}>from </span>
                        <span className="text-4xl font-semibold tracking-tight tabular-nums">{formatMoney(Number(plan.price) + fromPrice)}</span>
                        <span className={cx("text-sm", isFeatured ? "text-white/65" : "text-muted-foreground")}> / {PERIOD_UNIT[plan.billingPeriod]}</span>
                      </p>
                      <p className={cx("mt-1 text-xs", isFeatured ? "text-white/60" : "text-muted-foreground")}>
                        {Number(plan.price) > 0 ? `${formatMoney(plan.price)} base fee plus your products` : "No base fee: you only pay for your products"}
                      </p>
                      <ul className={cx("mt-6 space-y-2.5 border-t pt-6 text-sm", isFeatured ? "border-white/15 text-white/85" : "text-muted-foreground")}>
                        <PlanPerk featured={isFeatured}>Billed every {PERIOD_UNIT[plan.billingPeriod]}</PlanPerk>
                        {plan.pausable && <PlanPerk featured={isFeatured}>Pause when you need a break</PlanPerk>}
                        {plan.renewable && <PlanPerk featured={isFeatured}>Renew from your portal</PlanPerk>}
                        {plan.closable && <PlanPerk featured={isFeatured}>Close early at any time</PlanPerk>}
                      </ul>
                      <div className="mt-auto pt-8">
                        <ButtonLink
                          href={home ?? "/signup"}
                          variant={isFeatured ? "primary" : "secondary"}
                          className={cx("w-full", isFeatured && "bg-sun text-foreground hover:bg-sun/90")}
                        >
                          {home ? "Open your account" : "Get started"}
                        </ButtonLink>
                      </div>
                    </div>
                  );
                })}
              </Reveal>
              <p className="mt-8 text-center text-sm text-muted-foreground">
                Need a trial, team plan or add-ons?{" "}
                <Link href="/pricing" className="font-medium text-primary underline-offset-4 hover:underline">
                  See full pricing
                </Link>
              </p>
            </div>
          </section>
        )}

        {/* FAQ. */}
        <section id="faq" className="scroll-mt-20 border-t">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-24 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <SectionIntro title="Questions" body={`Anything else? ${companyName}'s team is happy to help.`} align="left" />
            <div className="divide-y border-y">
              {faq.map((item, i) => (
                <details key={item.q} className="group" open={i === 0}>
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

        {/* Closing call to action. */}
        <section className="px-6 pb-24">
          <div className="mx-auto max-w-6xl rounded-3xl bg-plum px-6 py-16 text-center text-white sm:px-12">
            <BrightloopMark variant="reversed" className="mx-auto size-12" />
            <h2 className="mx-auto mt-6 max-w-2xl font-display text-5xl leading-none font-bold text-balance sm:text-6xl">Ready to get started?</h2>
            <p className="mx-auto mt-4 max-w-md text-white/70">Create your account today. Our team will approve it and set up your subscription.</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {home ? (
                <ButtonLink href={home} className="h-11 bg-sun px-5 text-base text-foreground hover:bg-sun/90">
                  Go to your account <ArrowRight />
                </ButtonLink>
              ) : (
                <>
                  <ButtonLink href="/signup" className="h-11 bg-sun px-5 text-base text-foreground hover:bg-sun/90">
                    Create your account <ArrowRight />
                  </ButtonLink>
                  <LoginDialog
                    label="I already have an account"
                    variant="secondary"
                    className="h-11 border-white/25 bg-transparent px-5 text-base text-white hover:bg-white/10 hover:text-white"
                  />
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2.5">
            <BrightloopMark className="size-5" />
            <span>© {new Date().getFullYear()} {companyName}</span>
          </div>
          <nav aria-label="Footer" className="flex gap-5">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function SectionIntro({ title, body, align = "center" }: { title: string; body?: string; align?: "center" | "left" }) {
  return (
    <div className={cx("max-w-2xl", align === "center" && "mx-auto text-center")}>
      <h2 className="font-display text-5xl leading-none font-bold">
        <span className="marker-soft">{title}</span>
      </h2>
      {body && <p className="mt-4 text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

function PlanPerk({ featured, children }: { featured: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <CircleCheck className={cx("size-4 shrink-0 translate-y-0.5", featured ? "text-sun" : "text-primary")} aria-hidden />
      {children}
    </li>
  );
}

function PortalPreview({ productName, price, companyName }: { productName: string; price: string; companyName: string }) {
  return (
    <div className="relative" aria-hidden>
      <div className="rounded-2xl border bg-white p-5 text-foreground shadow-xl shadow-plum/10">
        <div className="flex items-center justify-between border-b pb-4">
          <div className="flex items-center gap-2.5">
            <BrightloopMark className="size-7" />
            <div className="leading-tight">
              <p className="text-sm font-semibold">{companyName}</p>
              <p className="text-xs text-muted-foreground">Customer portal</p>
            </div>
          </div>
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">AK</span>
        </div>

        <div className="mt-4 rounded-xl bg-[linear-gradient(160deg,#7d5573,#4f3149_70%)] p-4 text-white">
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
              <div className="h-full w-3/5 rounded-full bg-linear-to-r from-sun to-sun-soft" />
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
                <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">Pay now</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success">
                  <span className="size-1.5 rounded-full bg-success" /> Paid
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="absolute -bottom-12 -left-6 hidden items-center gap-3 rounded-xl border bg-white px-4 py-3 text-foreground shadow-lg sm:flex">
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
