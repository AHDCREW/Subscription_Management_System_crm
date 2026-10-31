import { useId } from "react";
import { cn } from "@/lib/utils";

// ROOT logo geometry from the brand kit (logos/svg): an "R" with a database stack,
// growing circuit roots that end in data nodes.
const R_PATH =
  "M220.5 51H262C278.5 51 292 64 292 81.5C292 96 285 106 274.6 111.8L293.6 139H272V136L266.2 126.8H262.4V121L259 116H237V138.5H220.5Z M237 65.5H259.5C268.2 65.5 275 72.8 275 81.5V86.5C274.5 95 267 101 258.5 101H237Z";
const DB_PATHS = [
  "M236 82H247V85H236Z",
  "M246 74.8a10 2.9 0 0 1 20 0v5.4a10 2.2 0 0 1-20 0Z M246 82.5a10 2.2 0 0 0 20 0v4a10 2.2 0 0 1-20 0Z M246 88.2a10 2.2 0 0 0 20 0v4.3a10 2.2 0 0 1-20 0Z",
];
const ROOT_LINES = [
  "M224.5 134.5L216 143H201L196.3 147.7",
  "M235 135.5L220.3 150.2H205.3L196.6 159.4",
  "M241.5 115V140.5L217.5 164.5V176",
  "M224.5 157.5H213L207 163.5V172.3",
  "M249 115V145.5L232.5 162V168L226.3 174.2",
  "M241.5 153V173L236.8 177.7",
  "M256.5 115V152L249.5 159V176L254.4 180.9",
  "M256.5 150L266.5 160V170",
  "M263.8 120V146.8L279.5 162.5V168.5L284.7 173.7",
  "M273.5 136V143L294.5 164V176",
  "M288 157.5H299L305 163.5V172.3",
  "M279 136.5L292.3 150.3H306.8L315.4 159.4",
  "M289.5 136.5L295.9 142.9H310.9L315.7 147.7",
];
const NODES = [
  [194.5, 161.5],
  [217.5, 179],
  [256.5, 183],
  [266.5, 173],
  [294.5, 179],
  [317.5, 161.5],
];

const GRADIENTS = {
  // Electric Blue glowing up from the roots into Deep Navy.
  color: [
    [0, "#0A8BE2"],
    [0.12, "#0085DB"],
    [0.25, "#0073C8"],
    [0.4, "#0058A0"],
    [0.54, "#004786"],
    [0.72, "#0D3966"],
    [0.84, "#102A4D"],
    [1, "#102A4D"],
  ],
  // For navy backgrounds: Soft Blue roots into white.
  reversed: [
    [0, "#3FA9F2"],
    [0.22, "#57B4F4"],
    [0.42, "#A6D6F8"],
    [0.62, "#FFFFFF"],
    [1, "#FFFFFF"],
  ],
} as const;

export function RootSymbol({ variant = "color", className }: { variant?: keyof typeof GRADIENTS; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const fill = `url(#${id}-g)`;
  return (
    <svg viewBox="188 49 136 141" className={cn("shrink-0", className)} aria-hidden>
      <defs>
        <radialGradient
          id={`${id}-g`}
          gradientUnits="userSpaceOnUse"
          cx="252"
          cy="178"
          r="100"
          gradientTransform="translate(252 178) scale(1.25 1) translate(-252 -178)"
        >
          {GRADIENTS[variant].map(([offset, color]) => (
            <stop key={offset} offset={offset} stopColor={color} />
          ))}
        </radialGradient>
        <mask id={`${id}-m`} maskUnits="userSpaceOnUse" x="180" y="40" width="160" height="160">
          <rect x="180" y="40" width="160" height="160" fill="#fff" />
          <path d="M239 87.5L227.5 99V139.5" stroke="#000" strokeWidth="2.9" fill="none" />
          <path d="M246 98.5L227.5 117" stroke="#000" strokeWidth="2.8" fill="none" />
        </mask>
      </defs>
      <g fill={fill}>
        <path mask={`url(#${id}-m)`} fillRule="evenodd" d={R_PATH} />
        {DB_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="none" stroke={fill} strokeWidth="3">
        {ROOT_LINES.map((d) => (
          <path key={d} d={d} />
        ))}
        {NODES.map(([cx, cy]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="3" strokeWidth="2.9" />
        ))}
      </g>
    </svg>
  );
}

// The ROOT wordmark: custom geometric letterforms, drawn in currentColor.
export function RootWordmark({ className }: { className?: string }) {
  return (
    <svg viewBox="-2 -2 404 104" className={cn("shrink-0 fill-current", className)} role="img" aria-label="ROOT">
      <path fillRule="evenodd" d="M0 0H40A29 29 0 0 1 40 58H18V100H0Z M18 18H40A11 11 0 0 1 40 40H18Z" />
      <path d="M36 48H56L80 100H60Z" />
      <path
        fillRule="evenodd"
        d="M142 -1a51 51 0 1 0 0.001 0Z M142 17a33 33 0 1 1 -0.001 0Z M254 -1a51 51 0 1 0 0.001 0Z M254 17a33 33 0 1 1 -0.001 0Z"
      />
      <path d="M320 0H400V18H369V100H351V18H320Z" />
    </svg>
  );
}

// App-icon tile (navy square, white R + database). Children replace the mark, e.g. a company initial.
export function BrandMark({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(16_42_77/0.25)]",
        className,
      )}
    >
      {children ?? (
        <svg viewBox="215 45 84 100" className="size-4.5 fill-current" aria-hidden>
          <path fillRule="evenodd" d={R_PATH} />
          {DB_PATHS.map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      )}
    </span>
  );
}

export function Brand({ className, subtitle }: { className?: string; subtitle?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <RootSymbol className="size-9" />
      <div className="min-w-0 leading-tight">
        <RootWordmark className="h-3.5 w-auto text-primary" />
        {subtitle && <p className="mt-1 truncate text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}
