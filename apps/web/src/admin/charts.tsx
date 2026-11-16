/**
 * Small charts for the monitoring tabs, plain SVG and HTML (no chart library): a line over time, a
 * sparkline, columns per day or hour, a weekday x hour heatmap and a meter. One series each, so no
 * legend: the card title names what is plotted. Text sits in HTML, never in the stretched SVG, so
 * letters keep their shape at any width. Pointer and arrow keys move one readout (crosshair and
 * tooltip) along the series.
 */
import { Fragment, type JSX } from 'preact';
import { useState } from 'preact/hooks';
import { formatBytesAt } from './format';
import { clampFill, type MemoryLevel, niceScale, type ScaleKind } from './logic';
import { CHART } from './strings';

export interface ChartPoint {
  /** null = no reading there (a gap in the line, no column). */
  value: number | null;
  /** Short text under the axis ("14.00", "16 Nov"). */
  label: string;
  /** Full text in the tooltip ("Sen, 16 Nov 14.00"). */
  detail: string;
}

const W = 720;
const GRID = 4;
const X_TICKS = 5;

/** Which points get a label under the axis: a few evenly spaced, always the last. */
function tickIndexes(n: number): Set<number> {
  const out = new Set<number>();
  if (n === 0) return out;
  const step = Math.max(1, Math.ceil(n / X_TICKS));
  for (let i = 0; i < n; i++) if (i % step === 0 && n - 1 - i >= step / 2) out.add(i);
  out.add(n - 1);
  return out;
}

/** Keeps a label near the edge inside the box instead of half outside it. */
function edgeShift(pct: number): string {
  if (pct < 8) return 'translateX(0)';
  if (pct > 92) return 'translateX(-100%)';
  return 'translateX(-50%)';
}

/** One readout index moved by the pointer (nearest point) or the arrow keys. */
function useScrub(n: number) {
  const [at, setAt] = useState<number | null>(null);
  const fromPointer = (e: JSX.TargetedPointerEvent<HTMLElement>, columns: boolean) => {
    const box = e.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || n === 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
    setAt(columns ? Math.min(n - 1, Math.floor(f * n)) : n === 1 ? 0 : Math.round(f * (n - 1)));
  };
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLElement>) => {
    if (n === 0) return;
    const cur = at ?? n - 1;
    const next =
      e.key === 'ArrowLeft'
        ? Math.max(0, cur - 1)
        : e.key === 'ArrowRight'
          ? Math.min(n - 1, cur + 1)
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? n - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setAt(next);
  };
  return {
    at,
    bind: (columns: boolean) => ({
      tabIndex: 0,
      onPointerMove: (e: JSX.TargetedPointerEvent<HTMLElement>) => fromPointer(e, columns),
      onPointerDown: (e: JSX.TargetedPointerEvent<HTMLElement>) => fromPointer(e, columns),
      onPointerLeave: () => setAt(null),
      onFocus: () => setAt((v) => v ?? (n > 0 ? n - 1 : null)),
      onBlur: () => setAt(null),
      onKeyDown: onKey,
    }),
  };
}

function YAxis({ max, format }: { max: number; format: (v: number) => string }) {
  const labels = Array.from({ length: GRID + 1 }, (_, i) => format(max * (1 - i / GRID)));
  const widest = Math.max(...labels.map((l) => l.length));
  return (
    <div class="ad-chart-y" aria-hidden="true" style={{ width: `calc(${widest}ch + 2px)` }}>
      {labels.map((text, i) => (
        <span key={i} class="ad-chart-y-label" style={{ top: `${(i / GRID) * 100}%` }}>
          {text}
        </span>
      ))}
    </div>
  );
}

function XAxis({ points, columns }: { points: readonly ChartPoint[]; columns: boolean }) {
  const n = points.length;
  const ticks = tickIndexes(n);
  return (
    <div class="ad-chart-x" aria-hidden="true">
      {points.map((p, i) => {
        if (!ticks.has(i)) return null;
        const pct = columns ? ((i + 0.5) / n) * 100 : n === 1 ? 50 : (i / (n - 1)) * 100;
        return (
          <span key={i} class="ad-chart-x-label" style={{ left: `${pct}%`, transform: edgeShift(pct) }}>
            {p.label}
          </span>
        );
      })}
    </div>
  );
}

function Tip({ point, pct, format }: { point: ChartPoint; pct: number; format: (v: number) => string }) {
  return (
    <div class="ad-tip" style={{ left: `${pct}%`, transform: edgeShift(pct) }}>
      <strong class="ad-tip-value">{point.value === null ? '-' : format(point.value)}</strong>
      <span>{point.detail}</span>
    </div>
  );
}

/** "Terakhir 42%, tertinggi 61%": the chart's numbers for screen readers. */
function summary(points: readonly ChartPoint[], format: (v: number) => string): string {
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const last = values[values.length - 1];
  if (last === undefined) return '';
  return CHART.summary(format(last), format(Math.max(...values)));
}

interface LineProps {
  points: readonly ChartPoint[];
  format: (v: number) => string;
  /** What the chart shows, for screen readers. */
  label: string;
  /** The top of the scale is at least this (1 for shares, so 30% never fills the box). */
  floorMax?: number;
  /** Sparkline: no axes, no readout. */
  mini?: boolean;
  /** 'integer' for counts (whole-number steps), 'bytes' for sizes (steps in KB, MB, GB). */
  scale?: ScaleKind;
  empty?: string;
}

/** A single series over time; gaps where a reading is missing. */
export function LineChart({
  points,
  format,
  label,
  floorMax = 0,
  mini = false,
  scale = 'number',
  empty,
}: LineProps) {
  const scrub = useScrub(points.length);
  const n = points.length;
  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  if (values.length === 0) return empty ? <p class="ad-chart-empty">{empty}</p> : null;

  const H = mini ? 56 : 200;
  // Sparklines keep a little air at the top; full charts put the top gridline at the scale's max.
  const pad = mini ? 4 : 0;
  const max = mini
    ? Math.max(floorMax, ...values) * 1.05 || 1
    : niceScale(Math.max(floorMax, ...values), GRID, scale);
  const xAt = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const yAt = (v: number) => pad + (H - pad) * (1 - Math.min(v, max) / max);

  // Split at missing readings; a lone reading draws as a dot (zero-length round-capped line).
  const segments: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  points.forEach((p, i) => {
    if (p.value === null) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else cur.push({ i, v: p.value });
  });
  if (cur.length) segments.push(cur);
  const line = segments
    .map((s) => {
      const d = s
        .map((q, k) => `${k === 0 ? 'M' : 'L'}${xAt(q.i).toFixed(1)} ${yAt(q.v).toFixed(1)}`)
        .join(' ');
      return s.length === 1 ? `${d} l0.01 0` : d;
    })
    .join(' ');
  const area = segments
    .filter((s) => s.length > 1)
    .map((s) => {
      const first = s[0] as { i: number };
      const last = s[s.length - 1] as { i: number };
      const top = s
        .map((q, k) => `${k === 0 ? 'M' : 'L'}${xAt(q.i).toFixed(1)} ${yAt(q.v).toFixed(1)}`)
        .join(' ');
      return `${top} L${xAt(last.i).toFixed(1)} ${H} L${xAt(first.i).toFixed(1)} ${H} Z`;
    })
    .join(' ');

  const svg = (
    <svg class="ad-chart-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      {!mini &&
        Array.from({ length: GRID + 1 }, (_, i) => {
          const y = pad + ((H - pad) / GRID) * i;
          return <line key={i} class="ad-chart-grid" x1={0} x2={W} y1={y} y2={y} />;
        })}
      {area && <path class="ad-chart-area" d={area} />}
      <path class="ad-chart-line" d={line} />
    </svg>
  );

  if (mini) return <div class="ad-spark">{svg}</div>;

  const at = scrub.at;
  const hovered = at === null ? null : points[at];
  const atPct = at === null ? 0 : (xAt(at) / W) * 100;
  const text = summary(points, format);
  return (
    <div class="ad-chart" style={{ '--plot-h': `${H}px` }}>
      <YAxis max={max} format={scale === 'bytes' ? (v) => formatBytesAt(v, max) : format} />
      <div class="ad-chart-body">
        <div
          class="ad-chart-plot"
          role="img"
          aria-label={text ? `${label}: ${text}` : label}
          {...scrub.bind(false)}
        >
          {svg}
          {hovered && (
            <>
              <span class="ad-chart-cross" style={{ left: `${atPct}%` }} />
              {hovered.value !== null && (
                <span
                  class="ad-chart-dot"
                  style={{ left: `${atPct}%`, top: `${(yAt(hovered.value) / H) * 100}%` }}
                />
              )}
              <Tip point={hovered} pct={atPct} format={format} />
            </>
          )}
        </div>
        <XAxis points={points} columns={false} />
      </div>
    </div>
  );
}

interface BarProps {
  points: readonly ChartPoint[];
  format: (v: number) => string;
  label: string;
  /** Axis labels may differ from tooltip values (counts on the axis, bytes in the tip). */
  axisFormat?: (v: number) => string;
  /** 'integer' for counts (whole-number steps), 'bytes' for sizes (steps in KB, MB, GB). */
  scale?: ScaleKind;
  empty?: string;
}

/** Columns, one per day or hour, from a shared baseline. */
export function BarChart({ points, format, label, axisFormat, scale = 'number', empty }: BarProps) {
  const scrub = useScrub(points.length);
  const n = points.length;
  const values = points.map((p) => p.value ?? 0);
  if (n === 0 || (empty && values.every((v) => v === 0)))
    return empty ? <p class="ad-chart-empty">{empty}</p> : null;
  const max = niceScale(Math.max(...values), GRID, scale);
  const at = scrub.at;
  const hovered = at === null ? null : points[at];
  const atPct = at === null ? 0 : ((at + 0.5) / n) * 100;
  const text = summary(points, format);
  return (
    <div class="ad-chart">
      <YAxis max={max} format={axisFormat ?? (scale === 'bytes' ? (v) => formatBytesAt(v, max) : format)} />
      <div class="ad-chart-body">
        <div
          class="ad-chart-plot ad-bars"
          role="img"
          aria-label={text ? `${label}: ${text}` : label}
          {...scrub.bind(true)}
        >
          {Array.from({ length: GRID + 1 }, (_, i) => (
            <span
              key={`g${i}`}
              class="ad-gridline"
              style={{ top: `${(i / GRID) * 100}%` }}
              aria-hidden="true"
            />
          ))}
          {points.map((p, i) => (
            <span key={i} class={`ad-bar-slot${i === at ? ' is-on' : ''}`}>
              {(p.value ?? 0) > 0 && (
                <span class="ad-bar" style={{ height: `${clampFill((p.value ?? 0) / max) * 100}%` }} />
              )}
            </span>
          ))}
          {hovered && <Tip point={hovered} pct={atPct} format={format} />}
        </div>
        <XAxis points={points} columns />
      </div>
    </div>
  );
}

interface HeatProps {
  /** 7 rows (Monday first) of 24 hours. */
  grid: readonly (readonly number[])[];
  days: readonly string[];
  label: string;
  /** Readout for a cell: day name, hour, value. */
  cellText: (day: number, hour: number, value: number) => string;
  /** Shown when nothing is pointed at. */
  idle: string;
  less: string;
  more: string;
}

/** Weekday x hour grid; one hue from the card's surface to orange by amount. */
export function Heatmap({ grid, days, label, cellText, idle, less, more }: HeatProps) {
  const [at, setAt] = useState<{ day: number; hour: number } | null>(null);
  const max = Math.max(0, ...grid.flat());
  const onKey = (e: JSX.TargetedKeyboardEvent<HTMLDivElement>) => {
    const cur = at ?? { day: 0, hour: 0 };
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    setAt({
      day: Math.min(6, Math.max(0, cur.day + m[0])),
      hour: Math.min(23, Math.max(0, cur.hour + m[1])),
    });
  };
  const readout = at ? cellText(at.day, at.hour, grid[at.day]?.[at.hour] ?? 0) : idle;
  return (
    <div class="ad-heat-wrap">
      <div
        class="ad-heat"
        role="img"
        aria-label={label}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable so the arrow keys can move the readout below, the same details a pointer gets.
        tabIndex={0}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
        onPointerLeave={() => setAt(null)}
      >
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={`h${h}`} class="ad-heat-hour" aria-hidden="true">
            {h % 6 === 0 ? h : ''}
          </span>
        ))}
        {grid.map((row, d) => (
          <Fragment key={`d${d}`}>
            <span class="ad-heat-day" aria-hidden="true">
              {days[d]}
            </span>
            {row.map((v, h) => (
              <span
                key={`${d}-${h}`}
                class={`ad-heat-cell${at?.day === d && at.hour === h ? ' is-on' : ''}`}
                style={{ '--heat': v > 0 && max > 0 ? (0.18 + 0.82 * (v / max)).toFixed(3) : '0' }}
                onPointerEnter={() => setAt({ day: d, hour: h })}
              />
            ))}
          </Fragment>
        ))}
      </div>
      <div class="ad-heat-foot">
        <span aria-live="polite">{readout}</span>
        <span class="ad-heat-scale" aria-hidden="true">
          {less}
          <span class="ad-heat-ramp">
            {[0.18, 0.45, 0.72, 1].map((a) => (
              <span key={a} class="ad-heat-swatch" style={{ '--heat': String(a) }} />
            ))}
          </span>
          {more}
        </span>
      </div>
    </div>
  );
}

/** A bar for "x of y"; the numbers are written next to it, so it is only a picture. */
export function Meter({ fraction, level }: { fraction: number; level: MemoryLevel }) {
  return (
    <span class={`ad-meter is-${level}`} aria-hidden="true">
      <span class="ad-meter-fill" style={{ width: `${(clampFill(fraction) * 100).toFixed(1)}%` }} />
    </span>
  );
}
