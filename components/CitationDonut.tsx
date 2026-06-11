"use client";

import {
  CITATION_KIND_LABEL,
  type Citation,
  type CitationKind,
} from "@/lib/citations/categories";
import { KIND_COLOR, KIND_ORDER } from "@/components/CitationBreakdown";

/**
 * Citation share by source category as a donut + legend. Same data + colours
 * as CitationBreakdown (the overview's stacked bar). Segments + legend sorted
 * by volume, largest first.
 *
 * `sweepDegrees` < 360 draws a gauge-style arc with the gap centered at the
 * bottom (270 = a 75% donut). `bare` skips the outer card wrapper so the donut
 * can be embedded in a card the caller already provides.
 *
 * Rendering: each slice is its own SVG <path> arc, NOT a stroke-dasharray
 * trick on a shared circle. The dasharray approach produced visible boundary
 * artifacts at small slice sizes (rounded background cap bulging through at
 * the start of the path, floating-point gaps between adjacent flat caps).
 * Explicit per-slice arcs give exact, non-overlapping geometry.
 */
export function CitationDonut({
  citations,
  sweepDegrees = 360,
  bare = false,
  selectedKind = null,
  onSelectKind,
}: {
  citations: Citation[];
  sweepDegrees?: number;
  bare?: boolean;
  /** When set, the matching slice + legend row are visually highlighted
   *  and the others are dimmed. Driven by parent state. */
  selectedKind?: CitationKind | null;
  /** When provided, slices + legend rows become buttons that call this
   *  with the clicked kind. Click the already-selected kind to deselect
   *  — the parent decides whether to honor that as a toggle. */
  onSelectKind?: (kind: CitationKind) => void;
}) {
  const interactive = typeof onSelectKind === "function";
  if (citations.length === 0) {
    return (
      <div
        className={
          bare
            ? "text-muted text-sm"
            : "border border-zinc-200 rounded-xl p-6 text-muted text-sm bg-zinc-50"
        }
      >
        No citations recorded for this window.
      </div>
    );
  }

  const counts = new Map<CitationKind, number>();
  for (const c of citations) counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  const total = citations.length;

  const rows = KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => ({
      kind: k,
      label: CITATION_KIND_LABEL[k],
      count: counts.get(k) ?? 0,
      pct: ((counts.get(k) ?? 0) / total) * 100,
      color: KIND_COLOR[k],
    }))
    .sort((a, b) => b.count - a.count);

  const size = 196;
  const stroke = 30;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;

  // Degrees: 0 = top of donut, increasing clockwise. Full circle → 0..360;
  // gauge → -sweep/2..+sweep/2 so the gap sits centered at the bottom.
  const sweepDeg = Math.min(360, Math.max(60, sweepDegrees));
  const isFull = sweepDeg >= 360;
  const startDeg = isFull ? 0 : -sweepDeg / 2;

  /** Point on the donut circle at `angleDeg` (0 = top, clockwise). */
  function pointAt(angleDeg: number) {
    const a = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  }

  /**
   * SVG path string for an arc from `fromDeg` to `toDeg`, clockwise. For a
   * full 360° arc, an SVG arc command can't represent a complete circle in
   * one segment (start == end is ambiguous) — split into two 180° arcs.
   */
  function arcPath(fromDeg: number, toDeg: number): string {
    const span = toDeg - fromDeg;
    if (span >= 359.999) {
      // Two semicircle arcs make a full circle.
      const top = pointAt(0);
      const bot = pointAt(180);
      return [
        `M ${top.x} ${top.y}`,
        `A ${r} ${r} 0 1 1 ${bot.x} ${bot.y}`,
        `A ${r} ${r} 0 1 1 ${top.x} ${top.y}`,
      ].join(" ");
    }
    const start = pointAt(fromDeg);
    const end = pointAt(toDeg);
    const largeArc = span > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  }

  // Walk segments in legend (volume-desc) order, accumulating degrees. The
  // last segment is pinned to the exact endDeg so float drift can't leave a
  // visible gap right before the start angle.
  const endDeg = startDeg + sweepDeg;
  let cursor = startDeg;
  const segments = rows.map((s, i) => {
    const from = cursor;
    const to = i === rows.length - 1 ? endDeg : from + (s.pct / 100) * sweepDeg;
    cursor = to;
    return { ...s, from, to };
  });

  const inner = (
    <>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="w-full max-w-[300px] h-auto"
        role="img"
        aria-label="Citation share by source category"
      >
        {/* Background track. For a full donut it's a plain circle (no
            dasharray quirks). For a gauge it's an arc with rounded ends so
            the visible track terminates softly. */}
        {isFull ? (
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="rgb(228 228 231)"
            strokeWidth={stroke}
          />
        ) : (
          <path
            d={arcPath(startDeg, endDeg)}
            fill="none"
            stroke="rgb(228 228 231)"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )}
        {segments.map((s) => {
          const isDimmed = selectedKind !== null && selectedKind !== s.kind;
          return (
            <path
              key={s.kind}
              d={arcPath(s.from, s.to)}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              // Butt caps tile perfectly against the next slice's butt cap, so
              // adjacent slices meet without overlap or gap.
              strokeLinecap="butt"
              onClick={
                interactive
                  ? (e) => {
                      e.stopPropagation();
                      onSelectKind!(s.kind);
                    }
                  : undefined
              }
              style={{
                cursor: interactive ? "pointer" : "default",
                opacity: isDimmed ? 0.35 : 1,
                transition: "opacity 150ms ease",
              }}
            />
          );
        })}
      </svg>

      <ul className="w-full grid grid-cols-1 gap-0.5 text-sm">
        {rows.map((s) => {
          const isSelected = selectedKind === s.kind;
          const isDimmed = selectedKind !== null && !isSelected;
          const content = (
            <>
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="text-muted tabular-nums whitespace-nowrap">
                {s.pct.toFixed(1)}%
              </span>
            </>
          );
          if (interactive) {
            return (
              <li key={s.kind}>
                <button
                  type="button"
                  onClick={() => onSelectKind!(s.kind)}
                  className={`w-full flex items-baseline justify-between gap-3 rounded px-1.5 py-1 text-left transition-colors ${
                    isSelected
                      ? "bg-zinc-200/70"
                      : isDimmed
                        ? "opacity-50 hover:opacity-100 hover:bg-zinc-100/70"
                        : "hover:bg-zinc-100/70"
                  }`}
                >
                  {content}
                </button>
              </li>
            );
          }
          return (
            <li
              key={s.kind}
              className="flex items-baseline justify-between gap-3"
            >
              {content}
            </li>
          );
        })}
      </ul>
    </>
  );

  if (bare) {
    return (
      <div className="flex flex-col items-center gap-5">{inner}</div>
    );
  }
  return (
    <div className="border border-zinc-200 rounded-xl p-5 bg-zinc-50 flex flex-col items-center gap-5">
      {inner}
    </div>
  );
}
