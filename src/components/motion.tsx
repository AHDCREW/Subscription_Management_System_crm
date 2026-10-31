"use client";

import type { ReactNode } from "react";
import FadeContent from "@/components/reactbits/FadeContent";
import AnimatedContent from "@/components/reactbits/AnimatedContent";
import CountUp from "@/components/reactbits/CountUp";
import { cn } from "@/lib/utils";

// Soft-load animations built on React Bits. Keep them subtle: short, small distances, no loops.

export function FadeIn({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <FadeContent trigger="mount" blur duration={0.6} delay={delay} className={className}>
      {children}
    </FadeContent>
  );
}

// Children slide up one after another; give each direct child its own element.
export function Stagger({ children, className, stagger = 0.06 }: { children: ReactNode; className?: string; stagger?: number }) {
  return (
    <AnimatedContent trigger="mount" distance={16} duration={0.5} ease="power2.out" stagger={stagger} className={className}>
      {children}
    </AnimatedContent>
  );
}

// Card for highlighted figures. `featured` is the dark hero card: use it for at most one figure per screen.
export function GlowCard({ children, className, featured = false }: { children: ReactNode; className?: string; featured?: boolean }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border p-5 shadow-xs",
        featured
          ? "border-primary bg-[linear-gradient(160deg,oklch(0.33_0.006_286),oklch(0.17_0.006_286)_70%)] text-primary-foreground shadow-md"
          : "bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  decimals = 0,
  hint,
  className,
  featured = false,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: ReactNode;
  className?: string;
  featured?: boolean;
}) {
  return (
    <GlowCard className={className} featured={featured}>
      <p className={cn("text-sm", featured ? "text-primary-foreground/70" : "text-muted-foreground")}>{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        <CountUp to={value} prefix={prefix} suffix={suffix} decimals={decimals} separator="," duration={1.2} trigger="load" />
      </p>
      {hint && <div className={cn("mt-1 text-xs", featured ? "text-primary-foreground/60" : "text-muted-foreground")}>{hint}</div>}
    </GlowCard>
  );
}
