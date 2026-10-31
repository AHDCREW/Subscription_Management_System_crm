import type { Metadata } from "next";
import { Caveat, Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Type from the Brightloop brief: Caveat for display headings, Inter for body and UI, JetBrains Mono for data.
const caveat = Caveat({ subsets: ["latin"], weight: "700", variable: "--font-caveat", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "ROOT · Where subscriptions grow", template: "%s · ROOT" },
  description: "Subscription management: plans, subscriptions, recurring billing and payments in one place.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${caveat.variable} ${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full bg-canvas font-sans text-foreground">
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
