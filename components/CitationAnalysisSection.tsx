"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { CitationCite } from "@/lib/marketData";
import {
  aggregateTopDomains,
  type CitedDomain,
} from "@/lib/citations/topDomains";
import { CitationCard } from "./CitationCard";
import { TopCitedDomainsCard } from "./TopCitedDomainsCard";
import { PLATFORM_ORDER, PLATFORM_LABEL } from "@/lib/platforms";

/**
 * Citation Analysis hero — the operator's first look at the page. Platform
 * pills along the top scope the donut + top-cited-domains list to a single
 * LLM (ChatGPT / Gemini / Google AIO) or pool across "All
 * platforms". When a non-"all" platform is active we re-aggregate domains
 * client-side so the shares reflect that platform's citation universe, not
 * the pre-computed cross-platform total.
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
}) {
  const [platform, setPlatform] = useState<string>("all");

  // Platforms actually present in the data, in stable canonical order.
  // Adding a new LLM upstream lights its pill automatically.
  const platforms = useMemo(() => {
    const present = new Set(citations.map((c) => c.model));
    return PLATFORM_ORDER.filter((m) => present.has(m));
  }, [citations]);

  const filtered = useMemo(
    () =>
      platform === "all"
        ? citations
        : citations.filter((c) => c.model === platform),
    [citations, platform],
  );

  const domains = useMemo(
    () =>
      platform === "all" ? topCitedDomains : aggregateTopDomains(filtered),
    [platform, filtered, topCitedDomains],
  );

  return (
    <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-6">
      <h2 className="text-xl mb-3" style={{ fontFamily: "var(--font-display)" }}>
        Citation Analysis
      </h2>

      <div className="flex flex-wrap items-center gap-1.5 mb-5">
        <Pill active={platform === "all"} onClick={() => setPlatform("all")}>
          All platforms
        </Pill>
        {platforms.map((m) => (
          <Pill
            key={m}
            active={platform === m}
            onClick={() => setPlatform(m)}
          >
            {PLATFORM_LABEL[m] ?? m}
          </Pill>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <div className="lg:col-span-1">
          <CitationCard citations={filtered} totalResults={totalRuns} />
        </div>
        {/* relative + min-h-0: the donut card on the left sets row height;
            this cell stretches and anchors the absolute domains card so its
            list scrolls within the matched height instead of pushing the
            row taller. */}
        <div className="relative min-h-0 lg:col-span-2">
          <TopCitedDomainsCard rows={domains} />
        </div>
      </div>
    </div>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "px-2.5 py-1 rounded-full text-[11px] uppercase tracking-widest border transition-colors",
        active
          ? "bg-gold/15 border-gold/40 text-gold"
          : "bg-white border-zinc-200 text-zinc-500 hover:text-foreground hover:border-zinc-300",
      ].join(" ")}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </button>
  );
}

// PLATFORM_ORDER / PLATFORM_LABEL moved to lib/platforms.ts — shared
// with SummaryCards so the registry has one source of truth.
