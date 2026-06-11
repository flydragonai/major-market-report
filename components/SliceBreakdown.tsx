"use client";

import type { Citation, CitationKind } from "@/lib/citations/categories";
import { CITATION_KIND_LABEL } from "@/lib/citations/categories";
import { KIND_COLOR } from "@/components/CitationBreakdown";

/**
 * Drilldown panel that opens beneath the citation donut when a slice is
 * clicked. Content varies by slice kind:
 *
 *   - agent_site → URL path-pattern buckets (homepage, blog, money page,
 *     about, etc.). The interesting story for client-owned-but-not-just-this-
 *     client agent websites is which page TYPES the LLMs are citing.
 *   - everything else → top-N domains within the slice. Brand-level
 *     breakdown is what makes "Directory" or "Portal" actionable
 *     (FastExpert vs HomeLight vs RealTrends — which directory is winning).
 *
 * Both views render the same horizontal bar shape used by the
 * top-cited-domains card so the visual language stays consistent.
 */
export function SliceBreakdown({
  kind,
  citations,
  onClose,
}: {
  kind: CitationKind;
  /** Citations PRE-FILTERED to this kind. The parent already has the
   *  full citation set; passing the filtered slice keeps this component
   *  small and forces re-computation when the kind changes. */
  citations: Citation[];
  onClose: () => void;
}) {
  const total = citations.length;
  const color = KIND_COLOR[kind];

  const items: { label: string; count: number; pct: number }[] =
    kind === "agent_site"
      ? bucketByPath(citations)
      : bucketByDomain(citations);

  return (
    <div
      className="mt-4 border rounded-lg p-3 bg-white"
      style={{ borderColor: `${color}55` }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
            style={{ backgroundColor: color }}
          />
          <div
            className="text-[10px] uppercase tracking-[0.3em] text-zinc-700 truncate"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {CITATION_KIND_LABEL[kind]}
            <span className="text-zinc-400 normal-case tracking-normal ml-2">
              {kind === "agent_site"
                ? "by page type"
                : "by domain"}{" "}
              · {total} citation{total === 1 ? "" : "s"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close breakdown"
          className="text-zinc-400 hover:text-foreground text-base leading-none px-1 shrink-0"
        >
          ×
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-xs text-muted py-2">No data to break down.</div>
      ) : (
        <ul className="space-y-0.5">
          {items.map((it) => {
            const widthPct = items[0].count > 0 ? (it.count / items[0].count) * 100 : 0;
            return (
              <li
                key={it.label}
                className="flex items-center gap-2 px-1 py-0.5 text-sm"
              >
                <div className="w-32 truncate text-foreground" title={it.label}>
                  {it.label}
                </div>
                <div className="flex-1 h-1.5 bg-zinc-100 rounded-sm overflow-hidden">
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: color,
                      opacity: 0.7,
                    }}
                  />
                </div>
                <div className="w-16 text-right tabular-nums text-xs">
                  <span className="text-foreground">{it.count}</span>
                  <span className="text-muted text-[10px] ml-1">
                    {it.pct.toFixed(1)}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ---------- Bucketing logic ----------

const MONEY_RE =
  /\/best-(real-estate-agent|realtor|probate|relocation|luxury|55-plus|55plus)|(best-real-estate-agent|best-realtor)\/?$|-best-(real-estate-agent|realtor)/i;

const PATH_BUCKETS: { label: string; matcher: (path: string) => boolean }[] = [
  {
    label: "Homepage",
    matcher: (p) => p === "" || p === "/",
  },
  {
    label: "Blog",
    matcher: (p) => /\/(blog|post|articles|news)\//.test(p),
  },
  {
    label: "Money page",
    matcher: (p) => MONEY_RE.test(p),
  },
  {
    label: "About / team",
    matcher: (p) =>
      /\/(about|bio|contact|agent|team|our-|the-company|work-with|who-we|meet|resume)/.test(
        p,
      ),
  },
  {
    label: "Neighborhood",
    matcher: (p) =>
      /\/(neighborhood|community|communities|area|explore-|markets|cities|towns)/.test(
        p,
      ),
  },
  {
    label: "Guide / FAQ",
    matcher: (p) =>
      /\/(guide|resources|faq|buyer|seller|tips|relocation)/.test(p),
  },
  {
    label: "Listing / property",
    matcher: (p) =>
      /\/(listing|property|properties|home-for-sale|homes-for-sale|for-sale)/.test(
        p,
      ),
  },
  {
    label: "Reviews",
    matcher: (p) => /\/(review|testimonial)/.test(p),
  },
  {
    label: "Search / IDX",
    matcher: (p) => /\/(search|idx|mls)/.test(p),
  },
];

function bucketByPath(
  citations: Citation[],
): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const c of citations) {
    let path = "";
    try {
      path = new URL(c.url).pathname.replace(/\/+$/, "").toLowerCase();
    } catch {
      path = "";
    }
    let bucket = "Other";
    for (const b of PATH_BUCKETS) {
      if (b.matcher(path)) {
        bucket = b.label;
        break;
      }
    }
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  const total = citations.length;
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count);
}

function bucketByDomain(
  citations: Citation[],
): { label: string; count: number; pct: number }[] {
  const counts = new Map<string, number>();
  for (const c of citations) {
    const d = (c.domain ?? "(unknown)").toLowerCase().replace(/^www\./, "");
    counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const total = citations.length;
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count, pct: (count / total) * 100 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}
