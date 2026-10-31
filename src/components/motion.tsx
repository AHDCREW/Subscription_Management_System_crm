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

// A flat paper card for highlighted figures. (No coloured glow: it reads as decoration, not information.)
export function GlowCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-lg border bg-card p-5", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  prefix,
  suffix,
  decimals = 0,
  hint,
  className,
}: {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <GlowCard className={className}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        <CountUp to={value} prefix={prefix} suffix={suffix} decimals={decimals} separator="," duration={1.2} trigger="load" />
      </p>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </GlowCard>
  );
}
