import { cn } from "@/lib/utils";

// Decorative brand element: circuit "roots" that branch at 45° and end in data nodes,
// the same language as the ROOT symbol. Drawn in currentColor.
const TRACES = [
  "M0 120H140L180 160H300L340 200H520",
  "M0 260H90L150 320H260",
  "M60 0V60L120 120",
  "M380 0V80L420 120H600L650 170H820",
  "M520 200V300L580 360H760",
  "M760 0V40L800 80H960",
  "M880 80V220L930 270H1200",
  "M1000 0V120L1060 180H1200",
  "M650 170V420",
  "M260 320V440",
  "M960 270V440",
  "M1100 180V300L1150 350",
];
const NODES = [
  [520, 200],
  [260, 320],
  [120, 120],
  [820, 170],
  [760, 360],
  [960, 80],
  [1200, 270],
  [650, 420],
  [1150, 350],
  [340, 200],
];

export function CircuitPattern({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1200 440"
      preserveAspectRatio="xMidYMid slice"
      className={cn("pointer-events-none absolute inset-0 size-full", className)}
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {TRACES.map((d) => (
          <path key={d} d={d} />
        ))}
        {NODES.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4.5" strokeWidth="2" />
        ))}
      </g>
    </svg>
  );
}

