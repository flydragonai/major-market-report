import { requireAdmin } from "@/lib/auth";
import { loadMarketReport } from "@/lib/marketData";
import { MARKETS, marketBySlug } from "@/lib/markets";
import { MarketPills } from "@/components/MarketPills";
import { PlatformScopedReport } from "@/components/PlatformScopedReport";
import { RunScoringButton } from "@/components/RunScoringButton";
import { RunStatusBadge } from "@/components/RunStatusBadge";
import { SummaryCards } from "@/components/SummaryCards";
import { UnclassifiedDomains } from "@/components/UnclassifiedDomains";
import { getActiveRunStatus } from "@/lib/runStatus";
import { unclassifiedDomains } from "@/lib/marketData";
import { buildQuerySet } from "@/lib/llms/querySet";

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

  // Core query templates with `{market}` left as a literal placeholder
  // so the SummaryCards `?` popover shows the shape, not a specific
  // market's rendered query. Resolved at request time (force-dynamic)
  // so the embedded date anchor reflects the current month.
  const coreQueryTemplates = buildQuerySet("{market}", null).map((q) => q.text);
  const summaryScopeLabel = isAll
    ? `Across all ${MARKETS.length} markets`
    : active.market.label;

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
          leaderboard ranks every agent the LLMs returned, by how often AI
          makes them the #1 pick.
        </p>
      </header>

      <PlatformScopedReport
        marketFilter={
          <div className="flex items-start justify-between gap-3">
            <div className="grid grid-cols-[5.5rem_1fr] items-baseline gap-2 flex-1 min-w-0">
              <span
                className="text-[10px] uppercase tracking-[0.3em] text-zinc-500"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Markets
              </span>
              <MarketPills
                markets={MARKETS}
                countsBySlug={countsBySlug}
                selectedSlug={requestedSlug}
              />
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {activeRunStatus && <RunStatusBadge status={activeRunStatus} />}
              <RunScoringButton
                slug={requestedSlug}
                label={active.market.label}
                disabled={Boolean(activeRunStatus)}
              />
            </div>
          </div>
        }
        summary={
          <SummaryCards
            totalQueries={active.responseCount}
            totalCitations={active.citations.length}
            totalAgents={active.agents.length}
            perPlatformQueries={active.perPlatformQueries}
            queryTemplates={coreQueryTemplates}
            scopeLabel={summaryScopeLabel}
          />
        }
        citations={active.citations}
        topCitedDomains={active.topCitedDomains}
        totalRuns={active.resultCount}
        agents={active.agents}
        agentsByPlatform={active.agentsByPlatform}
        markets={MARKETS}
        showMarketChips={isAll}
      />

      <section className="mb-10">
        <UnclassifiedDomains rows={unclassifiedDomains(active.citations)} />
      </section>
    </main>
  );
}
