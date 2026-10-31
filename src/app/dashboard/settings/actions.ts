"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";

export type SettingsField = "name" | "email" | "phone" | "address" | "gstNumber" | "currency" | "invoiceTag";
export type SettingsValues = Record<SettingsField, string>;

export type SettingsState =
  | {
      ok?: boolean;
      error?: string;
      fieldErrors?: Partial<Record<SettingsField, string>>;
      values?: SettingsValues;
    }
  | undefined;

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

const optional = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max} characters or fewer.`)
    .transform((v) => v || null);

const settingsSchema = z.object({
  name: z.string().trim().min(1, "Company name is required.").max(160, "Company name must be 160 characters or fewer."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(191, "Email must be 191 characters or fewer.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Enter a valid email address.")
    .transform((v) => v || null),
  phone: optional(40, "Phone"),
  address: optional(1000, "Address"),
  gstNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(30, "GST number must be 30 characters or fewer.")
    .refine((v) => /^[A-Z0-9]*$/.test(v), "Use letters and numbers only, e.g. 29ABCDE1234F1Z5.")
    .transform((v) => v || null),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z]{3}$/.test(v), "Use a 3-letter currency code, e.g. INR.")
    .refine((v) => KNOWN_CURRENCIES.has(v), "That isn't a currency code we recognise."),
  invoiceTag: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => /^[A-Z0-9]{2,10}$/.test(v), "Use 2–10 letters or numbers, e.g. INV."),
});

// Edits the single company settings row (id 1), creating it if it is missing.
export async function saveSettings(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  await requireAdmin();

  const text = (key: SettingsField) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const values: SettingsValues = {
    name: text("name"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    gstNumber: text("gstNumber"),
    currency: text("currency"),
    invoiceTag: text("invoiceTag"),
  };

  const parsed = settingsSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Partial<Record<SettingsField, string>> = {};
    for (const [field, messages] of Object.entries(z.flattenError(parsed.error).fieldErrors)) {
      if (messages?.length) fieldErrors[field as SettingsField] = messages[0];
    }
    return { error: "Please fix the highlighted fields.", fieldErrors, values };
  }
  const data = parsed.data;

  const saved = await db.companySettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } });

  // Company details show on invoices, the portal and the dashboard.
  revalidatePath("/", "layout");
  return {
    ok: true,
    values: {
      name: saved.name,
      email: saved.email ?? "",
      phone: saved.phone ?? "",
      address: saved.address ?? "",
      gstNumber: saved.gstNumber ?? "",
      currency: saved.currency,
      invoiceTag: saved.invoiceTag,
    },
  };
}
