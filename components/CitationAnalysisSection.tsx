"use client";

import { useMemo, useState } from "react";
import type { CitationCite } from "@/lib/marketData";
import {
  aggregateTopDomains,
  type CitedDomain,
} from "@/lib/citations/topDomains";
import type { CitationKind } from "@/lib/citations/categories";
import { CitationCard } from "./CitationCard";
import { TopCitedDomainsCard } from "./TopCitedDomainsCard";

/**
 * Citation Analysis hero — donut + top-cited-domains list. The platform
 * scope ("all" / a single LLM) is owned by the parent now and passed in,
 * so the same filter bar also drives the agent leaderboard. When a non-"all"
 * platform is active we re-aggregate domains client-side so the shares
 * reflect that platform's citation universe, not the pre-computed
 * cross-platform total.
 *
 * Lifted from client-reporting's admin CitationsSection — same data flow,
 * same DOM structure, same DOM-friendly layout (donut card sets row height
 * on the left, absolute-positioned domains list scrolls inside on the
 * right).
 */
export function CitationAnalysisSection({
  citations,
  topCitedDomains,
  totalRuns,
  platform,
}: {
  /** Citations already scoped to the active market (or pooled across all
   *  markets for the "All" view). Each carries a `model` tag for the
   *  platform filter. */
  citations: CitationCite[];
  /** Pre-computed top-20 for the All-platforms view. Saves a client-side
   *  reaggregation on the default render. */
  topCitedDomains: CitedDomain[];
  /** Sub-header "X runs" — drives the small label inside the donut card. */
  totalRuns: number;
  /** Active platform scope, owned by the parent filter bar. "all" pools
   *  every LLM; otherwise a single model slug. */
  platform: string;
}) {
  // Selected citation category. A slice click filters the "Top cited
  // domains" list on the right; independent of the platform scope.
  const [selectedKind, setSelectedKind] = useState<CitationKind | null>(null);

  const filtered = useMemo(
    () =>
      platform === "all"
        ? citations
        : citations.filter((c) => c.model === platform),
    [citations, platform],
  );

  const domains = useMemo(() => {
    // A selected slice narrows the list to that category's domains; we always
    // re-aggregate from `filtered` so the bars/shares reflect the slice.
    if (selectedKind !== null) {
      return aggregateTopDomains(
        filtered.filter((c) => c.kind === selectedKind),
      );
    }
    return platform === "all" ? topCitedDomains : aggregateTopDomains(filtered);
  }, [platform, filtered, topCitedDomains, selectedKind]);

  return (
    <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-6">
      <h2 className="text-xl mb-5" style={{ fontFamily: "var(--font-display)" }}>
        Citation Analysis
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-1">
          <CitationCard
            citations={filtered}
            totalResults={totalRuns}
            selectedKind={selectedKind}
            onSelectKind={(k) =>
              setSelectedKind((cur) => (cur === k ? null : k))
            }
          />
        </div>
        {/* relative + min-h-0: the donut card on the left sets row height;
            this cell stretches and anchors the absolute domains card so its
            list scrolls within the matched height instead of pushing the
            row taller. */}
        <div className="relative min-h-0 lg:col-span-2">
          <TopCitedDomainsCard
            rows={domains}
            filterKind={selectedKind}
            onClearFilter={() => setSelectedKind(null)}
          />
        </div>
      </div>
    </div>
  );
}
