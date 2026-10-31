import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SubFlow",
  description: "Subscription management: plans, subscriptions, recurring billing and payments in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
