import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

// Generic mailer shared by every module (password reset now, invoices later).
// With SMTP_HOST set, mail goes out over SMTP. Without it, the message is
// printed to the server console so the app still works fully offline.

export type Mail = { to: string; subject: string; text: string; html?: string };

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

// Absolute URL for links inside emails, e.g. appUrl("/reset-password?token=…").
export function appUrl(path = "") {
  const base = (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path}`;
}

// For user-supplied text (names) inside HTML email bodies.
export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export async function sendMail({ to, subject, text, html }: Mail) {
  if (!process.env.SMTP_HOST) {
    const line = "=".repeat(64);
    console.log(
      `\n${line}\n[mail] SMTP_HOST is not set, printing the email instead of sending it\n` +
        `To:      ${to}\nSubject: ${subject}\n\n${text}\n${line}\n`,
    );
    return;
  }

  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || "Brightloop <no-reply@brightloop.local>",
    to,
    subject,
    text,
    html,
  });
}
