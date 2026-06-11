"use client";

import { useMemo, useState } from "react";
import type { Citation, CitationKind } from "@/lib/citations/categories";
import { CitationDonut } from "@/components/CitationDonut";
import { SliceBreakdown } from "@/components/SliceBreakdown";

/**
 * Citation-mix donut wrapped with click-to-drill-down. Lifted from the
 * client-reporting admin overview so this app stays in sync with how
 * the team already reads citation shape.
 *
 * Click any slice → a breakdown panel renders beneath the donut showing
 *   - Agent-owned → URL path buckets (homepage / blog / money page / ...)
 *   - Every other slice → top domains within that slice
 * Click the same slice again, or the × in the panel, to close.
 */
export function CitationCard({
  citations,
  totalResults,
}: {
  citations: Citation[];
  totalResults: number;
}) {
  const [selectedKind, setSelectedKind] = useState<CitationKind | null>(null);
  const sliceCitations = useMemo(
    () =>
      selectedKind === null
        ? []
        : citations.filter((c) => c.kind === selectedKind),
    [selectedKind, citations],
  );

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
        onSelectKind={(k) =>
          setSelectedKind((cur) => (cur === k ? null : k))
        }
      />
      {selectedKind !== null && sliceCitations.length > 0 && (
        <SliceBreakdown
          kind={selectedKind}
          citations={sliceCitations}
          onClose={() => setSelectedKind(null)}
        />
      )}
    </div>
  );
}
