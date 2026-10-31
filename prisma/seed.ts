// Demo data for Brightloop Software.
//
//   npm run db:seed        (prisma db seed → tsx prisma/seed.ts)
//
// 1. Base data (company, team, taxes, products, plans, discounts, templates)
//    is upserted or created only when missing, so it is safe to re-run.
// 2. Bulk demo data (~300 customers, 2,000+ subscriptions, their invoices and
//    payments) is generated once. When the database already holds 2,000 or
//    more subscriptions the bulk step is skipped, so a second run adds nothing.
//
// Invoices are computed with the real billing engine (calculateInvoice,
// duePeriods, the same discount rules and usage limits) in the order a daily
// billing run would have produced them, then inserted in batches.
// Everything random comes from a seeded PRNG, so the data is the same on every
// fresh database (dates are relative to the day the seed runs).
// All demo accounts use the password Demo@12345.
import {
  PrismaClient,
  type BillingPeriod,
  type InvoiceStatus,
  type PaymentMethod,
  type Prisma,
  type ProductType,
  type Role,
  type SubscriptionStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";
import {
  calculateInvoice,
  dueDateFor,
  duePeriods,
  formatInvoiceNumber,
  addPeriod,
  linePrice,
  toDiscountRule,
  type DiscountRule,
} from "../src/lib/billing";
import { round2, toNumber } from "../src/lib/money";
import { subscriptionNumber } from "../src/lib/subscriptions/subscriptions";

const db = new PrismaClient();

const PASSWORD = "Demo@12345";
const BULK_SUBSCRIPTION_THRESHOLD = 2000;
const CUSTOMER_COUNT = 300;
const BATCH = 1000;

const DAY_MS = 24 * 60 * 60 * 1000;
const now = new Date();
// Today as a calendar date at midnight UTC (same convention as the app).
const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 60 * 60 * 1000);
// A moment during office hours (09:00–18:00 IST) on the given day, never in the future.
const officeTime = (day: Date) => new Date(Math.min(addHours(day, 3.5 + rand() * 9).getTime(), now.getTime()));
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);
const toDay = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const maxDate = (...dates: Date[]) => new Date(Math.max(...dates.map((d) => d.getTime())));
const minDate = (...dates: Date[]) => new Date(Math.min(...dates.map((d) => d.getTime())));

// ─────────────────────────────── Seeded randomness ───────────────────────────────

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261031);
const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
const chance = (p: number) => rand() < p;
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
function weighted<T>(entries: readonly (readonly [T, number])[]): T {
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = rand() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}
const hex = (length: number) => Array.from({ length }, () => Math.floor(rand() * 16).toString(16)).join("");
const digits = (length: number) => Array.from({ length }, () => Math.floor(rand() * 10)).join("");

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ─────────────────────────────── Name lists ───────────────────────────────

const FIRST_NAMES = [
  "Aarav", "Aditi", "Akash", "Amit", "Ananya", "Anil", "Anjali", "Arjun", "Arun", "Bhavna", "Deepak", "Divya",
  "Farhan", "Gaurav", "Geeta", "Harish", "Imran", "Ishaan", "Jaya", "Karthik", "Kavya", "Lakshmi", "Manoj", "Meera",
  "Mohit", "Nandini", "Naveen", "Neha", "Nikhil", "Pooja", "Prakash", "Pradeep", "Rahul", "Rajesh", "Ramesh", "Ravi",
  "Rekha", "Rohit", "Sachin", "Sanjay", "Sapna", "Shalini", "Shreya", "Siddharth", "Sneha", "Suresh", "Swati", "Tanvi",
  "Uday", "Varun", "Vijay", "Vikram", "Vinod", "Yash", "Zoya", "Fathima", "Jose", "Anoop", "Sunitha", "Mahesh",
];
const LAST_NAMES = [
  "Agarwal", "Bansal", "Bhat", "Chopra", "Das", "Desai", "Gupta", "Iyer", "Jain", "Joshi", "Kapoor", "Khan",
  "Kulkarni", "Kumar", "Malhotra", "Menon", "Mehta", "Mishra", "Nair", "Naidu", "Patel", "Pillai", "Rao", "Reddy",
  "Saxena", "Shah", "Sharma", "Shetty", "Singh", "Sinha", "Thomas", "Varghese", "Verma", "Yadav", "Chatterjee",
  "Banerjee", "Hegde", "Kamath", "Gowda", "Mathew",
];
const BUSINESS_TYPES = [
  "Traders", "Enterprises", "Textiles", "Pharma", "Foods", "Electronics", "Hardware", "Agencies", "Logistics",
  "Builders", "Motors", "Jewellers", "Sweets", "Medicals", "Furnishings", "Opticals", "Printers", "Steels", "Exports",
  "Distributors", "Bakers", "Clinic", "Interiors", "Tours & Travels", "Infotech", "Kirana", "Garments", "Auto Parts",
  "Caterers", "Stationers",
];
const BUSINESS_PREFIXES = [
  "Sri Lakshmi", "Shree Ganesh", "Green Leaf", "Royal", "Sunrise", "Annapurna", "Krishna", "Balaji", "Om Sai", "Metro",
  "New India", "Golden", "Bharat", "Kaveri", "Ganga", "Deccan", "Malabar", "Coastal", "Silver Oak", "Navratna",
  "Vijaya", "Sagar", "Everest", "Lotus", "Prime", "Star", "Akshaya", "Pearl", "Classic", "Hill View",
];
const CITIES = [
  ["Bengaluru", "Karnataka", "560"], ["Mumbai", "Maharashtra", "400"], ["Pune", "Maharashtra", "411"],
  ["Chennai", "Tamil Nadu", "600"], ["Hyderabad", "Telangana", "500"], ["Kochi", "Kerala", "682"],
  ["Ahmedabad", "Gujarat", "380"], ["Jaipur", "Rajasthan", "302"], ["Lucknow", "Uttar Pradesh", "226"],
  ["Kolkata", "West Bengal", "700"], ["Coimbatore", "Tamil Nadu", "641"], ["Indore", "Madhya Pradesh", "452"],
  ["Nagpur", "Maharashtra", "440"], ["Mysuru", "Karnataka", "570"], ["Surat", "Gujarat", "395"],
  ["Kozhikode", "Kerala", "673"], ["Thiruvananthapuram", "Kerala", "695"], ["Vadodara", "Gujarat", "390"],
  ["Chandigarh", "Chandigarh", "160"], ["Bhopal", "Madhya Pradesh", "462"],
] as const;
const STREETS = [
  "MG Road", "Station Road", "Main Bazaar", "Gandhi Nagar", "Nehru Street", "Market Road", "Ring Road",
  "Commercial Street", "Brigade Road", "Park Street", "Linking Road", "Anna Salai", "Ashok Nagar", "Civil Lines",
  "Industrial Estate", "Temple Road", "Church Street", "Club Road",
];

const slug = (value: string) => value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");

// ─────────────────────────────── Base data ───────────────────────────────

type ProductWithVariants = Prisma.ProductGetPayload<{ include: { variants: true; tax: true } }>;

async function ensureCompany() {
  await db.companySettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      name: "Brightloop Software",
      email: "billing@brightloop.test",
      phone: "+91 80 4000 1234",
      address: "4th Floor, Loop Tower, MG Road, Bengaluru, Karnataka 560001",
      gstNumber: "29ABCDE1234F1Z5",
      currency: "INR",
      invoiceTag: "INV",
    },
  });
}

async function ensureTeam(passwordHash: string) {
  const people: { name: string; email: string; role: Role; company?: string; phone?: string; address?: string }[] = [
    { name: "Asha Menon", email: "admin@brightloop.test", role: "ADMIN", phone: "+91 98450 10001" },
    { name: "Sameer Khan", email: "staff@brightloop.test", role: "STAFF", phone: "+91 98450 10002" },
    { name: "Priya Nair", email: "priya@brightloop.test", role: "STAFF", phone: "+91 98450 10003" },
    { name: "Rahul Verma", email: "rahul@brightloop.test", role: "STAFF", phone: "+91 98450 10004" },
    {
      name: "Kiran Rao",
      email: "customer@brightloop.test",
      role: "CUSTOMER",
      company: "Kiran Stores",
      phone: "+91 98860 22334",
      address: "14, Commercial Street, Bengaluru, Karnataka 560001",
    },
  ];
  const saved = [];
  for (const person of people) {
    saved.push(
      await db.user.upsert({
        where: { email: person.email },
        update: {},
        create: { ...person, passwordHash, createdAt: addDays(today, -300) },
      }),
    );
  }
  const [admin, ...rest] = saved;
  return { admin, staff: rest.filter((u) => u.role === "STAFF"), kiran: rest.find((u) => u.role === "CUSTOMER")! };
}

async function ensureTax(name: string, rate: number) {
  return (await db.tax.findFirst({ where: { name } })) ?? db.tax.create({ data: { name, rate } });
}

async function ensureProduct(input: {
  name: string;
  type: ProductType;
  salesPrice: number;
  costPrice: number;
  notes: string;
  taxId: number;
  variants?: { attribute: string; value: string; extraPrice: number }[];
}): Promise<ProductWithVariants> {
  const { variants = [], ...data } = input;
  let product = await db.product.findFirst({ where: { name: data.name } });
  if (!product) product = await db.product.create({ data: { ...data, createdAt: addDays(today, -280) } });
  for (const variant of variants) {
    await db.productVariant.upsert({
      where: { productId_attribute_value: { productId: product.id, attribute: variant.attribute, value: variant.value } },
      update: {},
      create: { productId: product.id, ...variant },
    });
  }
  return db.product.findUniqueOrThrow({ where: { id: product.id }, include: { variants: true, tax: true } });
}

async function ensurePlan(data: Prisma.PlanUncheckedCreateInput) {
  return (
    (await db.plan.findFirst({ where: { name: data.name } })) ??
    db.plan.create({ data: { ...data, createdAt: addDays(today, -280) } })
  );
}

async function ensureDiscount(data: Prisma.DiscountUncheckedCreateInput, productIds: number[]) {
  const existing = await db.discount.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return db.discount.create({
    data: { ...data, products: { create: productIds.map((productId) => ({ productId })) } },
  });
}

async function ensureTemplate(
  data: { name: string; validityDays: number; planId: number; notes: string },
  lines: { productId: number; variantId: number | null; quantity: number }[],
) {
  const existing = await db.quotationTemplate.findFirst({ where: { name: data.name } });
  if (existing) return existing;
  return db.quotationTemplate.create({ data: { ...data, lines: { create: lines } } });
}

function variantOf(product: ProductWithVariants, value: string) {
  const variant = product.variants.find((v) => v.value === value);
  if (!variant) throw new Error(`${product.name} has no variant ${value}`);
  return variant;
}

async function seedBase(passwordHash: string) {
  await ensureCompany();
  const team = await ensureTeam(passwordHash);
  const gst18 = await ensureTax("GST 18%", 18);
  const gst5 = await ensureTax("GST 5%", 5);

  const crm = await ensureProduct({
    name: "Brightloop CRM",
    type: "SOFTWARE",
    salesPrice: 999,
    costPrice: 300,
    notes: "Contacts, deals and follow-ups for small sales teams. Price per user per month.",
    taxId: gst18.id,
    variants: [
      { attribute: "Brand", value: "Standard", extraPrice: 0 },
      { attribute: "Brand", value: "Odoo", extraPrice: 560 },
    ],
  });
  const accounting = await ensureProduct({
    name: "Brightloop Accounting",
    type: "SOFTWARE",
    salesPrice: 1499,
    costPrice: 450,
    notes: "GST-ready books, bank reconciliation and e-invoicing.",
    taxId: gst18.id,
    variants: [
      { attribute: "Edition", value: "Basic", extraPrice: 0 },
      { attribute: "Edition", value: "Pro", extraPrice: 500 },
    ],
  });
  const storage = await ensureProduct({
    name: "Extra Storage 100 GB",
    type: "ADDON",
    salesPrice: 199,
    costPrice: 40,
    notes: "Additional 100 GB for attachments and backups.",
    taxId: gst18.id,
  });
  const support = await ensureProduct({
    name: "Priority Support",
    type: "ADDON",
    salesPrice: 499,
    costPrice: 150,
    notes: "Four-hour response time and a named support contact.",
    taxId: gst18.id,
  });
  const seat = await ensureProduct({
    name: "Extra User Seat",
    type: "ADDON",
    salesPrice: 149,
    costPrice: 20,
    notes: "One more user login on any Brightloop product.",
    taxId: gst18.id,
  });

  const monthly = await ensurePlan({
    name: "Monthly",
    price: 0,
    billingPeriod: "MONTHLY",
    pausable: true,
    closable: true,
    renewable: true,
  });
  const yearly = await ensurePlan({
    name: "Yearly",
    price: 0,
    billingPeriod: "YEARLY",
    pausable: false,
    closable: true,
    renewable: true,
  });
  const trial = await ensurePlan({
    name: "Weekly Trial",
    price: 0,
    billingPeriod: "WEEKLY",
    autoClose: true,
    pausable: false,
    closable: true,
    renewable: false,
    // On sale for a four-week window around the seed date.
    startDate: addDays(today, -14),
    endDate: addDays(today, 14),
  });
  const teamSeats = await ensurePlan({
    name: "Team Seats",
    price: 0,
    billingPeriod: "MONTHLY",
    minQuantity: 5,
    pausable: true,
    closable: true,
    renewable: true,
  });

  const seatsDiscount = await ensureDiscount(
    {
      name: "10% off 10+ seats",
      type: "PERCENTAGE",
      value: 10,
      scope: "PRODUCTS",
      minQuantity: 10,
      startDate: addDays(today, -60),
      usageLimit: 50,
    },
    [seat.id],
  );
  const launchDiscount = await ensureDiscount(
    {
      name: "₹500 launch offer",
      type: "FIXED",
      value: 500,
      scope: "SUBSCRIPTION",
      // Starts tomorrow so its 100 uses are left for live billing runs in the demo.
      startDate: addDays(today, 1),
      endDate: addDays(today, 30),
      usageLimit: 100,
    },
    [],
  );

  const starter = await ensureTemplate(
    {
      name: "Starter CRM",
      validityDays: 15,
      planId: monthly.id,
      notes: "Brightloop CRM with 100 GB of extra storage, billed monthly.",
    },
    [
      { productId: crm.id, variantId: variantOf(crm, "Standard").id, quantity: 1 },
      { productId: storage.id, variantId: null, quantity: 1 },
    ],
  );
  const enterprise = await ensureTemplate(
    {
      name: "Enterprise Yearly",
      validityDays: 30,
      planId: yearly.id,
      notes: "CRM (Odoo brand), Accounting Pro and 10 extra seats, billed yearly.",
    },
    [
      { productId: crm.id, variantId: variantOf(crm, "Odoo").id, quantity: 1 },
      { productId: accounting.id, variantId: variantOf(accounting, "Pro").id, quantity: 1 },
      { productId: seat.id, variantId: null, quantity: 10 },
    ],
  );

  return {
    team,
    taxes: { gst18, gst5 },
    products: { crm, accounting, storage, support, seat },
    plans: { monthly, yearly, trial, team: teamSeats },
    discounts: { seats: seatsDiscount, launch: launchDiscount },
    templates: { starter, enterprise },
  };
}

type Base = Awaited<ReturnType<typeof seedBase>>;

// ─────────────────────────────── Bulk generation ───────────────────────────────

type PlanKey = keyof Base["plans"];
type PayerProfile = "good" | "slow" | "bad";

interface CustomerDraft {
  name: string;
  email: string;
  company: string;
  phone: string;
  address: string;
  payer: PayerProfile;
  createdAt?: Date;
}

interface LineDraft {
  productId: number;
  variantId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxId: number | null;
  taxRate: number | null;
}

interface SubDraft {
  id: number;
  /** Index into the bulk customer list, or -1 for the portal demo customer. */
  customer: number;
  plan: PlanKey;
  templateId: number | null;
  status: SubscriptionStatus;
  startDate: Date;
  expiryDate: Date | null;
  paymentTermDays: number;
  quotationExpiresAt: Date | null;
  confirmedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  salespersonId: number;
  discountId: number | null;
  lines: LineDraft[];
  /** Last day a billing period may start on (ACTIVE: today, PAUSED: pause day, CLOSED: day before closing). */
  billUntil: Date | null;
  nextInvoiceDate: Date;
  /** Leave the newest invoice confirmed and unpaid (portal "Pay now" demo). */
  latestUnpaid?: boolean;
  payer: PayerProfile;
}

function makeCustomers(): CustomerDraft[] {
  const customers: CustomerDraft[] = [];
  const emails = new Set<string>();
  const companies = new Set<string>();
  while (customers.length < CUSTOMER_COUNT) {
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const company = chance(0.45) ? `${last} ${pick(BUSINESS_TYPES)}` : `${pick(BUSINESS_PREFIXES)} ${pick(BUSINESS_TYPES)}`;
    if (companies.has(company)) continue;
    let email = `${slug(first)}.${slug(last)}@${slug(company)}.test`;
    if (emails.has(email)) email = email.replace("@", `${customers.length}@`);
    companies.add(company);
    emails.add(email);
    const [city, state, pin] = pick(CITIES);
    customers.push({
      name: `${first} ${last}`,
      email,
      company,
      phone: `+91 ${pick(["98", "97", "99", "94", "90", "88", "70"])}${digits(3)} ${digits(5)}`,
      address: `${int(1, 220)}, ${pick(STREETS)}, ${city}, ${state} ${pin}${digits(3)}`,
      payer: weighted([
        ["good", 85],
        ["slow", 11],
        ["bad", 4],
      ] as const),
    });
  }
  return customers;
}

function generateSubscriptions(base: Base, customers: CustomerDraft[], kiranPayer: PayerProfile): SubDraft[] {
  const { products, templates, discounts, team } = base;
  const { crm, accounting, storage, support, seat } = products;
  const salespeople = [team.admin.id, ...team.staff.map((s) => s.id)];

  const line = (product: ProductWithVariants, variantValue: string | null, quantity: number, unitPrice?: number): LineDraft => {
    const variant = variantValue ? variantOf(product, variantValue) : null;
    return {
      productId: product.id,
      variantId: variant?.id ?? null,
      // Same text the subscription form stores: product name plus variant.
      description: variant ? `${product.name} (${variant.attribute}: ${variant.value})` : product.name,
      quantity,
      unitPrice: unitPrice ?? linePrice(toNumber(product.salesPrice), toNumber(variant?.extraPrice ?? 0)),
      taxId: product.taxId,
      taxRate: product.tax ? toNumber(product.tax.rate) : null,
    };
  };

  const brand = () => (chance(0.3) ? "Odoo" : "Standard");
  const edition = () => (chance(0.35) ? "Pro" : "Basic");
  const softwareQty = () => weighted([[1, 70], [2, 18], [3, 8], [5, 4]] as const);

  function regularLines(maxSeats: number): LineDraft[] {
    const lines: LineDraft[] = [];
    const roll = rand();
    if (roll < 0.6) lines.push(line(crm, brand(), softwareQty()));
    else if (roll < 0.8) lines.push(line(accounting, edition(), softwareQty()));
    else lines.push(line(crm, brand(), softwareQty()), line(accounting, edition(), 1));
    if (chance(0.4)) lines.push(line(storage, null, int(1, 3)));
    if (chance(0.25)) lines.push(line(support, null, 1));
    if (chance(0.35)) lines.push(line(seat, null, int(1, maxSeats)));
    return lines;
  }

  // Team Seats: every line needs at least 5 units. Only a handful of teams buy
  // 10+ seats, which is what the "10% off 10+ seats" discount looks for.
  let bigTeams = 0;
  function teamLines(): { lines: LineDraft[]; big: boolean } {
    const big = bigTeams < 14 && chance(0.12);
    if (big) bigTeams++;
    const lines = [line(crm, brand(), int(5, 12)), line(seat, null, big ? int(10, 25) : int(5, 9))];
    if (chance(0.3)) lines.push(line(accounting, edition(), int(5, 8)));
    return { lines, big };
  }

  const starterLines = () => [line(crm, "Standard", 1), line(storage, null, 1)];
  const enterpriseLines = () => [line(crm, "Odoo", 1), line(accounting, "Pro", 1), line(seat, null, 10)];

  const subs: SubDraft[] = [];
  const terms = () => weighted([[0, 15], [7, 25], [15, 40], [30, 20]] as const);
  // Slightly more recent starts than old ones, so the business steadily grows.
  const pastStart = (minDays: number, maxDays: number) =>
    addDays(today, -Math.round(minDays + (maxDays - minDays) * rand() ** 1.15));

  function add(status: SubscriptionStatus, choice: "monthly" | "yearly" | "team" | "starter" | "enterprise" | "trial") {
    const customer = int(0, customers.length - 1);
    let plan: PlanKey;
    let templateId: number | null = null;
    let lines: LineDraft[];
    let discountId: number | null = null;
    switch (choice) {
      case "monthly":
        plan = "monthly";
        lines = regularLines(8);
        break;
      case "yearly":
        plan = "yearly";
        lines = regularLines(9);
        break;
      case "team": {
        plan = "team";
        const t = teamLines();
        lines = t.lines;
        if (t.big) discountId = discounts.seats.id;
        break;
      }
      case "starter":
        plan = "monthly";
        templateId = templates.starter.id;
        lines = starterLines();
        break;
      case "enterprise":
        plan = "yearly";
        templateId = templates.enterprise.id;
        lines = enterpriseLines();
        discountId = discounts.seats.id;
        break;
      case "trial":
        plan = "trial";
        // A trial week at a quarter of the monthly price.
        lines = [line(crm, "Standard", 1, 249)];
        break;
    }

    const draft: SubDraft = {
      id: 0,
      customer,
      plan,
      templateId,
      status,
      startDate: today,
      expiryDate: null,
      paymentTermDays: terms(),
      quotationExpiresAt: null,
      confirmedAt: null,
      closedAt: null,
      createdAt: today,
      salespersonId: pick(salespeople),
      discountId,
      lines,
      billUntil: null,
      nextInvoiceDate: today,
      payer: customers[customer].payer,
    };

    const period: BillingPeriod = plan === "yearly" ? "YEARLY" : plan === "trial" ? "WEEKLY" : "MONTHLY";
    switch (status) {
      case "ACTIVE":
        draft.startDate = choice === "trial" ? addDays(today, -int(0, 13)) : pastStart(0, 240);
        draft.billUntil = today;
        break;
      case "PAUSED":
        draft.startDate = pastStart(70, 240);
        draft.billUntil = addDays(today, -int(5, Math.min(60, daysBetween(draft.startDate, today) - 35)));
        break;
      case "CLOSED": {
        draft.startDate = pastStart(90, 240);
        const lastDay = Math.min(daysBetween(draft.startDate, today) - 3, 200);
        draft.closedAt = officeTime(addDays(draft.startDate, int(35, lastDay)));
        draft.billUntil = addDays(draft.closedAt, -1);
        break;
      }
      case "CONFIRMED":
        draft.startDate = addDays(today, int(1, 30));
        draft.confirmedAt = officeTime(addDays(today, -int(0, 10)));
        break;
      case "QUOTATION":
        draft.startDate = addDays(today, int(3, 40));
        // Most quotations are still open; some have quietly expired.
        draft.quotationExpiresAt = addDays(today, chance(0.8) ? int(1, 30) : -int(1, 20));
        break;
      case "DRAFT":
        draft.startDate = addDays(today, int(1, 45));
        break;
    }

    if (choice === "trial") draft.expiryDate = addDays(draft.startDate, 28);
    else if (period === "YEARLY") draft.expiryDate = addPeriod(draft.startDate, "YEARLY");
    else if (chance(0.4)) draft.expiryDate = addPeriod(draft.startDate, "MONTHLY", 12);

    const validity = templateId === templates.starter.id ? 15 : 30;
    const pastStatus = status === "ACTIVE" || status === "PAUSED" || status === "CLOSED";
    if (pastStatus) {
      // Quoted a few days before it started, confirmed shortly after.
      draft.createdAt = officeTime(addDays(draft.startDate, -int(2, 12)));
      draft.confirmedAt = minDate(officeTime(addDays(toDay(draft.createdAt), int(1, 2))), addHours(draft.startDate, 3));
    } else if (status === "QUOTATION" && draft.quotationExpiresAt) {
      draft.createdAt = officeTime(minDate(addDays(draft.quotationExpiresAt, -validity), today));
    } else if (status === "CONFIRMED" && draft.confirmedAt) {
      // Accepted within the quotation's validity.
      draft.createdAt = officeTime(addDays(toDay(draft.confirmedAt), -int(1, 10)));
    } else {
      draft.createdAt = officeTime(addDays(today, -int(0, 20)));
    }
    // Everything past draft was sent as a quotation; template drafts get the template's validity up front.
    if (!draft.quotationExpiresAt && (status !== "DRAFT" || templateId)) {
      draft.quotationExpiresAt = addDays(toDay(draft.createdAt), validity);
    }
    draft.nextInvoiceDate = draft.startDate;

    subs.push(draft);
  }

  const mix = <T extends string>(entries: readonly (readonly [T, number])[]) => () => weighted(entries);
  const mixes = {
    ACTIVE: mix([["monthly", 62], ["yearly", 18], ["team", 12], ["starter", 5], ["enterprise", 3]] as const),
    PAUSED: mix([["monthly", 75], ["team", 15], ["starter", 10]] as const),
    CLOSED: mix([["monthly", 70], ["yearly", 15], ["team", 10], ["starter", 5]] as const),
    OPEN: mix([["monthly", 40], ["yearly", 15], ["team", 10], ["starter", 22], ["enterprise", 13]] as const),
  };
  const counts: [SubscriptionStatus, number, () => Parameters<typeof add>[1]][] = [
    ["ACTIVE", 1480, mixes.ACTIVE],
    ["PAUSED", 120, mixes.PAUSED],
    ["CLOSED", 210, mixes.CLOSED],
    ["CONFIRMED", 80, mixes.OPEN],
    ["QUOTATION", 160, mixes.OPEN],
    ["DRAFT", 110, mixes.OPEN],
  ];
  for (const [status, count, choose] of counts) for (let i = 0; i < count; i++) add(status, choose());
  for (let i = 0; i < 60; i++) add("ACTIVE", "trial");

  // The portal demo customer: an active monthly CRM (Odoo) with an unpaid
  // latest invoice, a yearly Accounting Pro, and an open quotation.
  const kiranSub = (overrides: Partial<SubDraft>): SubDraft => ({
    id: 0,
    customer: -1,
    plan: "monthly",
    templateId: null,
    status: "ACTIVE",
    startDate: today,
    expiryDate: null,
    paymentTermDays: 15,
    quotationExpiresAt: null,
    confirmedAt: null,
    closedAt: null,
    createdAt: today,
    salespersonId: team.staff[0]?.id ?? team.admin.id,
    discountId: null,
    lines: [],
    billUntil: null,
    nextInvoiceDate: today,
    payer: kiranPayer,
    ...overrides,
  });
  const kiranMonthlyStart = addPeriod(addDays(today, -10), "MONTHLY", -5);
  const kiranYearlyStart = addDays(today, -120);
  subs.push(
    kiranSub({
      startDate: kiranMonthlyStart,
      createdAt: addHours(addDays(kiranMonthlyStart, -4), 5.5),
      confirmedAt: addHours(addDays(kiranMonthlyStart, -2), 9.25),
      billUntil: today,
      nextInvoiceDate: kiranMonthlyStart,
      lines: [line(crm, "Odoo", 1), line(storage, null, 1)],
      latestUnpaid: true,
    }),
    kiranSub({
      plan: "yearly",
      startDate: kiranYearlyStart,
      expiryDate: addPeriod(kiranYearlyStart, "YEARLY"),
      paymentTermDays: 30,
      createdAt: addHours(addDays(kiranYearlyStart, -6), 6.75),
      confirmedAt: addHours(addDays(kiranYearlyStart, -1), 10.5),
      billUntil: today,
      nextInvoiceDate: kiranYearlyStart,
      lines: [line(accounting, "Pro", 1)],
    }),
    kiranSub({
      status: "QUOTATION",
      templateId: templates.starter.id,
      startDate: addDays(today, 7),
      nextInvoiceDate: addDays(today, 7),
      quotationExpiresAt: addDays(today, 15),
      createdAt: officeTime(today),
      lines: starterLines(),
    }),
  );

  return subs;
}

// ─────────────────────────────── Billing history ───────────────────────────────

interface InvoiceDraft {
  invoice: Prisma.InvoiceCreateManyInput;
  lines: Omit<Prisma.InvoiceLineCreateManyInput, "invoiceId">[];
  payments: Omit<Prisma.PaymentCreateManyInput, "invoiceId">[];
}

const usedReferences = new Set<string>();
function paymentReference(method: PaymentMethod): string | null {
  for (;;) {
    let ref: string | null;
    switch (method) {
      case "DEMO_PAY":
        ref = `DEMO-${hex(16)}`;
        break;
      case "UPI":
        ref = `UPI-${digits(12)}`;
        break;
      case "BANK_TRANSFER":
        ref = `UTR-HDFC${digits(10)}`;
        break;
      case "CARD":
        ref = `CARD-${digits(4)}-${hex(8).toUpperCase()}`;
        break;
      case "CHEQUE":
        ref = `CHQ-${digits(6)}`;
        break;
      case "CASH":
        ref = null;
        break;
    }
    if (ref === null) return null;
    if (!usedReferences.has(ref)) {
      usedReferences.add(ref);
      return ref;
    }
  }
}

const METHODS = [
  ["UPI", 34],
  ["BANK_TRANSFER", 24],
  ["DEMO_PAY", 16],
  ["CARD", 14],
  ["CASH", 6],
  ["CHEQUE", 6],
] as const;

function simulateBilling(
  base: Base,
  subs: SubDraft[],
  discountRules: Map<number, DiscountRule>,
  customerIds: number[],
  kiranId: number,
  invoiceTag: string,
  firstInvoiceId: number,
) {
  const planById = {
    monthly: base.plans.monthly,
    yearly: base.plans.yearly,
    trial: base.plans.trial,
    team: base.plans.team,
  };
  const staffIds = [base.team.admin.id, ...base.team.staff.map((s) => s.id)];

  // Every billing period that a daily billing run would have invoiced.
  const events: { sub: SubDraft; start: Date; end: Date; latest: boolean }[] = [];
  for (const sub of subs) {
    if (!sub.billUntil) continue;
    const plan = planById[sub.plan];
    const periods = duePeriods(sub.startDate, sub.billUntil, plan.billingPeriod, sub.expiryDate);
    periods.forEach((p, i) => events.push({ sub, ...p, latest: i === periods.length - 1 }));
    // Billing in advance: next invoice is due at the end of the last billed period.
    sub.nextInvoiceDate = periods.length ? periods[periods.length - 1].end : sub.startDate;
  }
  events.sort((a, b) => a.start.getTime() - b.start.getTime() || a.sub.id - b.sub.id);

  const rules = [...discountRules.values()];
  const usage = new Map<number, number>();
  const drafts: InvoiceDraft[] = [];

  events.forEach((event, index) => {
    const { sub, start, end } = event;
    const plan = planById[sub.plan];
    const calc = calculateInvoice({
      lines: sub.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        taxRate: l.taxRate,
      })),
      planPrice: toNumber(plan.price),
      planName: plan.name,
      discounts: rules,
      pinnedDiscountId: sub.discountId,
      on: start,
    });
    if (calc.appliedDiscountId !== null) {
      discountRules.get(calc.appliedDiscountId)!.usedCount += 1;
      usage.set(calc.appliedDiscountId, (usage.get(calc.appliedDiscountId) ?? 0) + 1);
    }

    const id = firstInvoiceId + index;
    const dueDate = dueDateFor(start, sub.paymentTermDays);
    const age = daysBetween(start, today);
    // The daily billing run at 08:00 IST.
    const createdAt = minDate(addHours(start, 2.5), now);
    const payments: InvoiceDraft["payments"] = [];
    let status: InvoiceStatus;
    let sentAt: Date | null = null;

    if (age <= 1) {
      // Created by the last billing runs, not reviewed yet.
      status = "DRAFT";
    } else if (!sub.latestUnpaid && age > 5 && chance(0.012)) {
      status = "CANCELLED";
    } else {
      status = "CONFIRMED";
      sentAt = officeTime(addDays(start, int(0, 1)));
      const forceUnpaid = sub.latestUnpaid && event.latest;
      let payDate: Date | null = null;
      if (!forceUnpaid) {
        const grace = Math.max(sub.paymentTermDays, 3);
        if (sub.payer === "good") payDate = chance(0.98) ? addDays(start, int(0, grace)) : null;
        else if (sub.payer === "slow") payDate = addDays(dueDate, int(3, 35));
        else payDate = chance(0.45) ? addDays(dueDate, int(15, 60)) : null;
      }
      if (payDate && payDate <= today) {
        const method = weighted(METHODS);
        const recordedById = method === "DEMO_PAY" ? null : pick(staffIds);
        const pay = (amount: number, date: Date, m: PaymentMethod, note: string | null, by: number | null) =>
          payments.push({
            method: m,
            amount,
            paymentDate: date,
            note,
            reference: paymentReference(m),
            recordedById: by,
            createdAt: officeTime(date),
          });
        if (method !== "DEMO_PAY" && chance(0.05)) {
          // Part payment now, sometimes the rest later.
          const first = round2(calc.total * pick([0.3, 0.4, 0.5, 0.6]));
          pay(first, payDate, method, "Part payment", recordedById);
          const restDate = addDays(payDate, int(7, 30));
          if (chance(0.5) && restDate <= today) {
            pay(round2(calc.total - first), restDate, weighted(METHODS.filter(([m]) => m !== "DEMO_PAY")), "Balance", pick(staffIds));
          }
        } else {
          pay(calc.total, payDate, method, method === "DEMO_PAY" ? "Paid online with Demo Pay" : null, recordedById);
        }
      }
    }

    const amountPaid = round2(payments.reduce((sum, p) => sum + Number(p.amount), 0));
    if (status === "CONFIRMED" && amountPaid >= calc.total) status = "PAID";
    const lastActivity = maxDate(createdAt, sentAt ?? createdAt, ...payments.map((p) => p.createdAt as Date));

    drafts.push({
      invoice: {
        id,
        number: formatInvoiceNumber(invoiceTag, id),
        subscriptionId: sub.id,
        customerId: sub.customer === -1 ? kiranId : customerIds[sub.customer],
        status,
        invoiceDate: start,
        dueDate,
        periodStart: start,
        periodEnd: end,
        subtotal: calc.subtotal,
        discountTotal: calc.discountTotal,
        taxTotal: calc.taxTotal,
        total: calc.total,
        amountPaid,
        sentAt,
        createdAt,
        updatedAt: lastActivity,
      },
      lines: calc.lines.map((l) => ({
        productId: l.productId,
        description: l.description,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountAmount: l.discountAmount,
        taxRate: l.taxRate,
        taxAmount: l.taxAmount,
        amount: l.amount,
      })),
      payments,
    });
  });

  return { drafts, usage };
}

async function seedBulk(base: Base, passwordHash: string) {
  const customers = makeCustomers();
  const kiranPayer: PayerProfile = "good";
  const subs = generateSubscriptions(base, customers, kiranPayer);

  // Customers signed up a little before their first subscription.
  const firstSub = new Map<number, Date>();
  for (const sub of subs) {
    if (sub.customer < 0) continue;
    const seen = firstSub.get(sub.customer);
    if (!seen || sub.createdAt < seen) firstSub.set(sub.customer, sub.createdAt);
  }
  customers.forEach((c, i) => {
    const first = firstSub.get(i) ?? addDays(today, -int(1, 200));
    c.createdAt = officeTime(addDays(toDay(first), -int(1, 20)));
  });

  await db.user.createMany({
    data: customers.map((c) => ({
      name: c.name,
      email: c.email,
      company: c.company,
      phone: c.phone,
      address: c.address,
      role: "CUSTOMER" as const,
      passwordHash,
      createdAt: c.createdAt,
      updatedAt: c.createdAt,
    })),
    skipDuplicates: true,
  });
  const rows = await db.user.findMany({
    where: { email: { in: customers.map((c) => c.email) } },
    select: { id: true, email: true },
  });
  const idByEmail = new Map(rows.map((r) => [r.email, r.id]));
  const customerIds = customers.map((c) => idByEmail.get(c.email)!);

  // Subscription ids (and so SUB-numbers) in the order they were created.
  subs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const subIdStart = ((await db.subscription.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
  subs.forEach((sub, i) => (sub.id = subIdStart + i));

  const discountRows = await db.discount.findMany({ include: { products: { select: { productId: true } } } });
  const discountRules = new Map(discountRows.map((d) => [d.id, toDiscountRule(d)]));
  const settings = await db.companySettings.findUnique({ where: { id: 1 }, select: { invoiceTag: true } });
  const invoiceIdStart = ((await db.invoice.aggregate({ _max: { id: true } }))._max.id ?? 0) + 1;
  const { drafts, usage } = simulateBilling(
    base,
    subs,
    discountRules,
    customerIds,
    base.team.kiran.id,
    settings?.invoiceTag ?? "INV",
    invoiceIdStart,
  );

  const planIds = {
    monthly: base.plans.monthly.id,
    yearly: base.plans.yearly.id,
    trial: base.plans.trial.id,
    team: base.plans.team.id,
  };
  for (const group of chunk(subs, 500)) {
    await db.$transaction([
      db.subscription.createMany({
        data: group.map((sub) => ({
          id: sub.id,
          number: subscriptionNumber(sub.id),
          customerId: sub.customer === -1 ? base.team.kiran.id : customerIds[sub.customer],
          planId: planIds[sub.plan],
          templateId: sub.templateId,
          salespersonId: sub.salespersonId,
          discountId: sub.discountId,
          status: sub.status,
          startDate: sub.startDate,
          expiryDate: sub.expiryDate,
          nextInvoiceDate: sub.nextInvoiceDate,
          paymentTermDays: sub.paymentTermDays,
          quotationExpiresAt: sub.quotationExpiresAt,
          confirmedAt: sub.confirmedAt,
          closedAt: sub.closedAt,
          createdAt: sub.createdAt,
          updatedAt: maxDate(sub.createdAt, sub.confirmedAt ?? sub.createdAt, sub.closedAt ?? sub.createdAt),
        })),
      }),
      db.subscriptionLine.createMany({
        data: group.flatMap((sub) =>
          sub.lines.map((l) => ({
            subscriptionId: sub.id,
            productId: l.productId,
            variantId: l.variantId,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxId: l.taxId,
          })),
        ),
      }),
    ]);
  }

  for (const group of chunk(drafts, BATCH)) {
    await db.$transaction([
      db.invoice.createMany({ data: group.map((d) => d.invoice) }),
      db.invoiceLine.createMany({
        data: group.flatMap((d) => d.lines.map((l) => ({ ...l, invoiceId: d.invoice.id! }))),
      }),
      db.payment.createMany({
        data: group.flatMap((d) => d.payments.map((p) => ({ ...p, invoiceId: d.invoice.id! }))),
      }),
    ]);
  }

  for (const [discountId, used] of usage) {
    await db.discount.update({ where: { id: discountId }, data: { usedCount: { increment: used } } });
  }

  return { customers: customers.length, subscriptions: subs.length, invoices: drafts.length };
}

// ─────────────────────────────── Summary ───────────────────────────────

async function printSummary(startedAt: number) {
  const [roles, subs, invoices, payments, overdue, discounts] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.subscription.groupBy({ by: ["status"], _count: { _all: true } }),
    db.invoice.groupBy({ by: ["status"], _count: { _all: true }, _sum: { total: true, amountPaid: true } }),
    db.payment.aggregate({ _count: { _all: true }, _sum: { amount: true } }),
    db.invoice.aggregate({
      where: { status: "CONFIRMED", dueDate: { lt: today }, amountPaid: { lt: db.invoice.fields.total } },
      _count: { _all: true },
      _sum: { total: true, amountPaid: true },
    }),
    db.discount.findMany({ select: { name: true, usedCount: true, usageLimit: true } }),
  ]);
  const money = (value: unknown) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(toNumber(value as number));
  const line = (label: string, value: string | number) => console.log(`  ${label.padEnd(22)} ${value}`);

  console.log("\nBrightloop demo data");
  for (const r of roles) line(`Users (${r.role.toLowerCase()})`, r._count._all);
  for (const s of subs) line(`Subscriptions ${s.status.toLowerCase()}`, s._count._all);
  for (const i of invoices) line(`Invoices ${i.status.toLowerCase()}`, `${i._count._all}  (${money(i._sum.total)})`);
  line("Payments", `${payments._count._all}  (${money(payments._sum.amount)})`);
  line(
    "Overdue invoices",
    `${overdue._count._all}  (${money(toNumber(overdue._sum.total) - toNumber(overdue._sum.amountPaid))} due)`,
  );
  for (const d of discounts) line(`Discount used`, `${d.name}: ${d.usedCount}/${d.usageLimit ?? "∞"}`);
  console.log(`\nDone in ${((Date.now() - startedAt) / 1000).toFixed(1)}s. Log in as admin@brightloop.test / ${PASSWORD}`);
}

async function main() {
  const startedAt = Date.now();
  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const base = await seedBase(passwordHash);

  const existing = await db.subscription.count();
  if (existing >= BULK_SUBSCRIPTION_THRESHOLD) {
    console.log(`Found ${existing} subscriptions already; skipping bulk demo data.`);
  } else {
    const created = await seedBulk(base, passwordHash);
    console.log(
      `Created ${created.customers} customers, ${created.subscriptions} subscriptions and ${created.invoices} invoices.`,
    );
  }

  await printSummary(startedAt);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
