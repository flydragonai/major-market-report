"use client";

import type { Citation, CitationKind } from "@/lib/citations/categories";
import { CitationDonut } from "@/components/CitationDonut";

/**
 * Citation-mix donut. Lifted from the client-reporting admin overview so this
 * app stays in sync with how the team already reads citation shape.
 *
 * Click any slice → the parent filters the "Top cited domains" list on the
 * right to that category. Selection is controlled by the parent so the donut
 * highlight and the filtered list stay in lockstep; click the same slice again
 * to clear.
 */
export function CitationCard({
  citations,
  totalResults,
  selectedKind,
  onSelectKind,
}: {
  citations: Citation[];
  totalResults: number;
  /** Currently selected slice, lifted to the parent so it can filter the
   *  adjacent domains list. */
  selectedKind: CitationKind | null;
  /** Toggle handler — called with the clicked kind. */
  onSelectKind: (kind: CitationKind) => void;
}) {
  return (
    <div className="border border-zinc-200 rounded-xl p-5 bg-zinc-50">
      <div className="flex items-baseline justify-between mb-3">
        <div
          className="text-[10px] uppercase tracking-[0.3em] text-zinc-500"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Citation mix
        </div>
        <div className="text-xs text-muted">
          {totalResults.toLocaleString()} run{totalResults === 1 ? "" : "s"}
        </div>
      </div>
      <CitationDonut
        citations={citations}
        bare
        selectedKind={selectedKind}
        onSelectKind={onSelectKind}
      />
    </div>
  );
}
