import { requireAdmin } from "@/lib/auth";
import { loadMarketReport } from "@/lib/marketData";
import { MARKETS, marketBySlug } from "@/lib/markets";
import { MarketPills } from "@/components/MarketPills";
import { CitationAnalysisSection } from "@/components/CitationAnalysisSection";
import { MarketLeaderboard } from "@/components/MarketLeaderboard";
import { RunScoringButton } from "@/components/RunScoringButton";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { UnclassifiedDomains } from "@/components/UnclassifiedDomains";
import { getActiveRunStatus } from "@/lib/runStatus";
import { unclassifiedDomains } from "@/lib/marketData";

export const dynamic = "force-dynamic";

type SearchParams = { m?: string };

export default async function MajorMarketReport({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();
  const sp = await searchParams;
  const requestedSlug = sp.m && marketBySlug(sp.m) ? sp.m : "all";

  // Run report + active-run status in parallel — the badge needs the
  // status, the page needs the report, neither depends on the other.
  const [report, activeRunStatus] = await Promise.all([
    loadMarketReport(),
    getActiveRunStatus(requestedSlug),
  ]);

  // Pill counts use responseCount — the number of (model × query) rows
  // each bucket contributed — so empty markets show "—" instead of "0".
  const countsBySlug: Record<string, number> = {
    all: report.all.responseCount,
  };
  for (const b of report.perMarket) {
    countsBySlug[b.market.slug] = b.responseCount;
  }

  const active =
    requestedSlug === "all"
      ? report.all
      : (report.perMarket.find((b) => b.market.slug === requestedSlug) ??
        report.all);
  const isAll = active.market.slug === "all";

  return (
    <main className="min-h-screen px-4 sm:px-6 py-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <p
          className="text-xs uppercase tracking-[0.4em] text-muted mb-1"
          style={{ fontFamily: "var(--font-display)" }}
        >
          FlyDragon · Major Market Report
        </p>
        <h1
          className="text-3xl sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {isAll
            ? "Top agents across major markets"
            : `Top agents · ${active.market.label}`}
        </h1>
        <p className="text-sm text-zinc-600 mt-3 max-w-3xl">
          Who AI keeps recommending across the {MARKETS.length} markets we
          track. Citation mix shows which sources LLMs lean on; the
          leaderboard ranks every agent the LLMs returned, by total AI
          mentions.
        </p>
      </header>

      <section className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <MarketPills
          markets={MARKETS}
          countsBySlug={countsBySlug}
          selectedSlug={requestedSlug}
        />
        <div className="flex items-center gap-3">
          {activeRunStatus && <RunStatusBadge status={activeRunStatus} />}
          <RunScoringButton
            slug={requestedSlug}
            label={active.market.label}
            disabled={Boolean(activeRunStatus)}
          />
        </div>
      </section>

      <section className="mb-10">
        <CitationAnalysisSection
          citations={active.citations}
          topCitedDomains={active.topCitedDomains}
          totalRuns={active.resultCount}
        />
      </section>

      <section className="mb-10">
        <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2
              className="text-xl"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Agent leaderboard
            </h2>
            <div className="text-xs text-muted">
              Ranked by mentions · ties broken by Top 3 → #1
            </div>
          </div>
          <MarketLeaderboard
            agents={active.agents}
            markets={MARKETS}
            showMarketChips={isAll}
          />
        </div>
      </section>

      <section className="mb-10">
        <UnclassifiedDomains rows={unclassifiedDomains(active.citations)} />
      </section>
    </main>
  );
}
