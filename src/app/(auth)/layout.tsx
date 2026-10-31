import { Brand } from "@/components/brand";
import BlurText from "@/components/reactbits/BlurText";
import { FadeIn } from "@/components/motion";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div className="mb-8 flex flex-col items-center gap-3 text-center">
        <Brand className="animate-in fade-in zoom-in-95 duration-500" />
        <BlurText
          text="Subscriptions and recurring billing in one place"
          className="justify-center text-sm text-muted-foreground"
          trigger="load"
          stepDuration={0.2}
          distance={10}
        />
      </div>
      <FadeIn delay={0.15} className="w-full max-w-sm">
        {children}
      </FadeIn>
    </main>
  );
}
