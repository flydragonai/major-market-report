import {
  CITATION_KIND_LABEL,
  type Citation,
  type CitationKind,
} from "@/lib/citations/categories";

type Props = {
  citations: Citation[];
};

export const KIND_COLOR: Record<CitationKind, string> = {
  portal: "rgb(99 102 241)",        // indigo
  agent_site: "rgb(255 107 53)",    // brand orange (controllable-layer highlight)
  gbp: "rgb(52 211 153)",           // emerald
  knowledge_graph: "rgb(20 184 166)", // teal-green (Google surface, near GBP)
  brokerage: "rgb(244 114 182)",    // pink
  local_media: "rgb(251 146 60)",   // orange
  video: "rgb(248 113 113)",        // red
  social: "rgb(167 139 250)",       // purple
  review: "rgb(56 189 248)",        // sky
  directory: "rgb(45 212 191)",     // teal
  pr: "rgb(250 204 21)",            // amber
  // Distinct rose-coral so the eye separates listicles from `pr`'s amber
  // and from `brokerage`'s deeper pink — important since listicles are
  // the "paid placement disguised as editorial" bucket and clients ask
  // about it as its own thing.
  listicle: "rgb(251 113 133)",     // rose-400
  wiki: "rgb(148 163 184)",         // slate
  // New buckets introduced when we switched the classifier default away
  // from agent_site — pick distinct hues so the donut legend doesn't
  // bleed them into adjacent colors.
  government: "rgb(120 113 108)",   // stone — neutral-but-readable for gov
  jobs: "rgb(202 138 4)",           // amber-700 — distinct from pr's softer amber
  unclassified: "rgb(212 212 216)", // zinc-300 — visually muted so the eye
                                    // reads it as "needs work" rather than a
                                    // first-class category
  other: "rgb(82 82 91)",           // zinc
};

// Display order mirrors the report's source-category chart (page 7).
// Unclassified pinned LAST so the triage bucket sits at the bottom of
// the legend — operators see it last, after the real categories.
export const KIND_ORDER: CitationKind[] = [
  "portal",
  "agent_site",
  "gbp",
  "knowledge_graph",
  "brokerage",
  "local_media",
  "video",
  "social",
  "review",
  "directory",
  "pr",
  "listicle",
  "wiki",
  "government",
  "jobs",
  "other",
  "unclassified",
];

/**
 * Citation share by source category, single horizontal stacked bar + legend.
 * Total is the sum of all citation rows; each segment is the share of that
 * total. Mirrors the visual idiom on page 7 of the 2026 AI Citation Index.
 */
export function CitationBreakdown({ citations }: Props) {
  if (citations.length === 0) {
    return (
      <div className="border border-zinc-200 rounded-lg p-6 text-muted text-sm">
        No citations recorded for this window.
      </div>
    );
  }

  const counts = new Map<CitationKind, number>();
  for (const c of citations) {
    counts.set(c.kind, (counts.get(c.kind) ?? 0) + 1);
  }
  const total = citations.length;

  // Sorted by volume (largest share first) so the bar and legend lead with the
  // dominant sources. KIND_ORDER is now only the tiebreak for equal counts.
  const rows = KIND_ORDER.filter((k) => (counts.get(k) ?? 0) > 0)
    .map((k) => ({
      kind: k,
      label: CITATION_KIND_LABEL[k],
      count: counts.get(k) ?? 0,
      pct: ((counts.get(k) ?? 0) / total) * 100,
      color: KIND_COLOR[k],
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex w-full h-3 rounded-full overflow-hidden bg-zinc-100">
        {rows.map((r) => (
          <div
            key={r.kind}
            style={{ width: `${r.pct}%`, backgroundColor: r.color }}
            title={`${r.label}: ${r.count} (${r.pct.toFixed(1)}%)`}
          />
        ))}
      </div>

      {/* Legend / breakdown — single column so the category name is the
          leading key on every row regardless of card width. */}
      <ul className="mt-4 space-y-1.5 text-sm">
        {rows.map((r) => (
          <li
            key={r.kind}
            className="flex items-baseline justify-between gap-3"
          >
            <span className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
                style={{ backgroundColor: r.color }}
              />
              <span className="truncate">{r.label}</span>
            </span>
            <span className="text-muted tabular-nums whitespace-nowrap">
              {r.pct.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs text-muted">
        {total.toLocaleString()} citation{total === 1 ? "" : "s"} across the
        selected runs.
      </p>
    </div>
  );
}
