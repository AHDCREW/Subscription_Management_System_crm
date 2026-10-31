import { cn } from "@/lib/utils";

// Decorative brand element: overlapping loops (billing cycles) with small bright dots
// riding on them, the same language as the Brightloop mark. Drawn in currentColor.
const LOOPS = [
  [120, 380, 210],
  [520, -40, 170],
  [1060, 120, 240],
  [760, 470, 150],
  [300, 120, 90],
];
const DOTS = [
  [268, 232],
  [640, 80],
  [880, 300],
  [1110, 362],
  [880, 420],
  [210, 76],
];

export function LoopPattern({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 440"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {LOOPS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      <g fill="currentColor">
        {DOTS.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="5" />
        ))}
      </g>
    </svg>
  );
}
