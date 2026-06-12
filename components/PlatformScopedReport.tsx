"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { AgentRow, CitationCite } from "@/lib/marketData";
import type { CitedDomain } from "@/lib/citations/topDomains";
import type { Market } from "@/lib/markets";
import { PLATFORM_ORDER, PLATFORM_LABEL } from "@/lib/platforms";
import { CitationAnalysisSection } from "./CitationAnalysisSection";
import { MarketLeaderboard } from "./MarketLeaderboard";

/**
 * Owns the shared platform scope and renders the filter bar above both the
 * Citation Analysis section and the Agent leaderboard. Selecting a platform
 * (ChatGPT / Gemini / Google AIO) re-scopes the citation mix + top domains
 * AND swaps the leaderboard to that LLM's pre-tallied ranking. "All
 * platforms" pools everything — the default cross-LLM view.
 *
 * Both sections used to live in separate server-rendered <section>s with the
 * platform pills buried inside the citation card; lifting the scope here lets
 * one control drive the whole report.
 */
export function PlatformScopedReport({
  marketFilter,
  summary,
  citations,
  topCitedDomains,
  totalRuns,
  agents,
  agentsByPlatform,
  markets,
  showMarketChips,
}: {
  /** The market pills + run-scoring controls, rendered server-side and
   *  passed in so they share the unified filter panel with the platform
   *  bar. */
  marketFilter: ReactNode;
  /** Summary cards, rendered server-side and passed in so they sit directly
   *  below the filter panel — filters scope them (via the market URL param),
   *  so the controls lead the page. */
  summary: ReactNode;
  citations: CitationCite[];
  topCitedDomains: CitedDomain[];
  totalRuns: number;
  /** Cross-platform leaderboard — the "all" view. */
  agents: AgentRow[];
  /** Per-platform leaderboards keyed by model slug. */
  agentsByPlatform: Record<string, AgentRow[]>;
  markets: Market[];
  showMarketChips: boolean;
}) {
  const [platform, setPlatform] = useState<string>("all");

  // Platforms actually present, in canonical order. A platform counts as
  // present if it surfaced citations or ranked any agent, so the bar lights
  // up the same set the data can actually be sliced by.
  const platforms = useMemo(() => {
    const present = new Set<string>(citations.map((c) => c.model));
    for (const m of Object.keys(agentsByPlatform)) present.add(m);
    return PLATFORM_ORDER.filter((m) => present.has(m));
  }, [citations, agentsByPlatform]);

  const leaderboardAgents =
    platform === "all" ? agents : (agentsByPlatform[platform] ?? []);

  return (
    <>
      <section className="mb-8">
        {/* Unified filter panel: a tinted, bordered surface that groups the
            market + platform controls and visually separates them from the
            white summary cards above and analysis cards below. */}
        <div className="rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4 sm:p-5">
          <h2
            className="mb-5"
            style={{ fontFamily: "var(--font-display)", fontSize: "1.0625rem" }}
          >
            Report filters
          </h2>
          {marketFilter}
          <div className="mt-4 pt-4 border-t border-zinc-200 grid grid-cols-[5.5rem_1fr] items-baseline gap-2">
            <span
              className="text-[10px] uppercase tracking-[0.3em] text-zinc-500"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Platform
            </span>
            <div className="flex flex-wrap gap-1.5">
              <Pill
                active={platform === "all"}
                onClick={() => setPlatform("all")}
              >
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
          </div>
        </div>
      </section>

      <section className="mb-10">{summary}</section>

      <section className="mb-10">
        <CitationAnalysisSection
          citations={citations}
          topCitedDomains={topCitedDomains}
          totalRuns={totalRuns}
          platform={platform}
        />
      </section>

      <section className="mb-10">
        <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-6">
          <div className="flex items-baseline justify-between mb-4 gap-3">
            <h2 className="text-xl" style={{ fontFamily: "var(--font-display)" }}>
              Agent leaderboard
              {platform !== "all" && (
                <span className="text-muted text-sm ml-2">
                  · {PLATFORM_LABEL[platform] ?? platform}
                </span>
              )}
            </h2>
            <div className="text-xs text-muted">
              Ranked by #1s · ties broken by Top 3 → mentions
            </div>
          </div>
          <MarketLeaderboard
            agents={leaderboardAgents}
            markets={markets}
            showMarketChips={showMarketChips}
          />
        </div>
      </section>
    </>
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
        "px-3 py-1.5 rounded-full text-xs uppercase tracking-widest border transition-colors",
        active
          ? "bg-gold/15 border-gold/40 text-gold"
          : "bg-white border-zinc-200 text-zinc-600 hover:text-foreground hover:border-zinc-300",
      ].join(" ")}
      style={{ fontFamily: "var(--font-display)" }}
    >
      {children}
    </button>
  );
}
