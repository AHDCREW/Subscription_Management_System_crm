import { formatMoney } from "@/lib/money";
import { formatMoneyCompact, monthLabel } from "@/lib/reports/format";
import type { RevenueMonth } from "@/lib/reports/queries";

// Hand-built SVG bar chart: payments received per month. Ink bars, the current
// month in --chart-2, hairline gridlines. Bars grow in once on load (CSS only).

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 24, right: 8, bottom: 28, left: 56 };
const TICKS = 4;

/** A round axis maximum (1, 2, 2.5 or 5 × 10ⁿ per tick) at or above `max`. */
function niceMax(max: number): number {
  if (max <= 0) return TICKS;
  const rough = max / TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? rough;
  return step * TICKS;
}

export function RevenueChart({ months, currency }: { months: RevenueMonth[]; currency: string }) {
  const max = niceMax(Math.max(0, ...months.map((m) => m.amount)));
  const plotWidth = WIDTH - PAD.left - PAD.right;
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotWidth / months.length;
  const barWidth = Math.min(56, slot * 0.56);
  const y = (value: number) => PAD.top + plotHeight - (value / max) * plotHeight;
  const current = months.length - 1;
  const total = months.reduce((sum, m) => sum + m.amount, 0);
  const first = months[0];
  const last = months[current];
  const summary = `Revenue by month from ${monthLabel(first.start, true)} to ${monthLabel(last.start, true)}: ${months
    .map((m) => `${monthLabel(m.start)} ${formatMoney(m.amount, currency)}`)
    .join(", ")}.`;

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-labelledby="revenue-chart-title revenue-chart-desc"
      >
        <title id="revenue-chart-title">Revenue, last 6 months</title>
        <desc id="revenue-chart-desc">{summary}</desc>
        <style>{`
          .revenue-bar { transform-box: fill-box; transform-origin: bottom; animation: revenue-bar-grow 0.5s cubic-bezier(0.2, 0.7, 0.2, 1) both; }
          @keyframes revenue-bar-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
          @media (prefers-reduced-motion: reduce) { .revenue-bar { animation: none; } }
        `}</style>

        {Array.from({ length: TICKS + 1 }, (_, i) => {
          const value = (max / TICKS) * i;
          const lineY = y(value);
          return (
            <g key={i} aria-hidden>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={lineY} y2={lineY} stroke="var(--border)" strokeWidth={1} />
              <text x={PAD.left - 8} y={lineY} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
                {formatMoneyCompact(value, currency)}
              </text>
            </g>
          );
        })}

        {months.map((month, i) => {
          const cx = PAD.left + slot * i + slot / 2;
          const barY = y(month.amount);
          const barHeight = PAD.top + plotHeight - barY;
          const isCurrent = i === current;
          return (
            <g key={month.key} aria-hidden>
              {barHeight > 0 && (
                <rect
                  className="revenue-bar"
                  style={{ animationDelay: `${i * 20}ms` }}
                  x={cx - barWidth / 2}
                  y={barY}
                  width={barWidth}
                  height={barHeight}
                  rx={3}
                  fill={isCurrent ? "var(--chart-2)" : "var(--chart-1)"}
                />
              )}
              <text x={cx} y={barY - 6} textAnchor="middle" className="fill-muted-foreground text-xs tabular-nums">
                {month.amount > 0 ? formatMoneyCompact(month.amount, currency) : "—"}
              </text>
              <text
                x={cx}
                y={HEIGHT - 8}
                textAnchor="middle"
                className={isCurrent ? "fill-foreground text-xs font-medium" : "fill-muted-foreground text-xs"}
              >
                {monthLabel(month.start)}
              </text>
            </g>
          );
        })}
      </svg>

      <table className="sr-only">
        <caption>Payments received per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Revenue</th>
            <th scope="col">Payments</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row">{monthLabel(month.start, true)}</th>
              <td>{formatMoney(month.amount, currency)}</td>
              <td>{month.count}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <figcaption className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: "var(--chart-2)" }} />
          {monthLabel(last.start, true)} so far
        </span>
        <span className="tabular-nums">
          {total > 0 ? `${formatMoney(total, currency)} received over 6 months` : "No payments received in the last 6 months."}
        </span>
      </figcaption>
    </figure>
  );
}
