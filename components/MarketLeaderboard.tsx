import type { AgentRow } from "@/lib/marketData";
import type { Market } from "@/lib/markets";
import { AgentAvatar } from "./AgentAvatar";

/**
 * Cross-market agent leaderboard. Ranked by total AI mentions, with
 * top-3 count + #1 count as tie breaks (sorted upstream in
 * lib/marketData.ts rankAgent).
 *
 * Each row carries the columns the operator scans for: rank, avatar,
 * name + domain, total mentions, top-3 count, #1 count, and (on the
 * All-markets view) the set of markets the agent appears in.
 *
 * Designed to be readable at glance from the All bucket — first 25 rows
 * are the "national-scope" agents AI keeps surfacing across major
 * markets, which is the headline of the whole report.
 */

const TOP_N = 25;

export function MarketLeaderboard({
  agents,
  markets,
  showMarketChips,
}: {
  agents: AgentRow[];
  markets: Market[];
  /** Render the multi-market chip column. On for the All view; off on
   *  per-market views because every chip would be the same one. */
  showMarketChips: boolean;
}) {
  if (agents.length === 0) {
    return (
      <div className="border border-zinc-200 rounded-xl bg-zinc-50 p-6 text-sm text-muted">
        No AI recommendations captured for this scope yet.
      </div>
    );
  }
  const shown = agents.slice(0, TOP_N);
  const labelBySlug = new Map(markets.map((m) => [m.slug, m.label]));
  return (
    <div className="border border-zinc-200 rounded-xl bg-zinc-50 overflow-hidden">
      <div className="hidden sm:grid grid-cols-[3rem_2.5rem_1fr_5rem_5rem_5rem] gap-3 px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-zinc-500 border-b border-zinc-200 bg-white"
        style={{ fontFamily: "var(--font-display)" }}
      >
        <div className="text-right">#</div>
        <div></div>
        <div>Agent</div>
        <div className="text-right">Mentions</div>
        <div className="text-right">Top 3</div>
        <div className="text-right">#1</div>
      </div>
      <ol className="divide-y divide-zinc-100">
        {shown.map((a, i) => (
          <li
            key={`${a.name}-${i}`}
            className="grid grid-cols-[3rem_2.5rem_1fr_5rem_5rem_5rem] gap-3 items-center px-4 py-2.5"
          >
            <div
              className="text-right tabular-nums text-sm text-zinc-400"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {i + 1}
            </div>
            <AgentAvatar name={a.name} domain={a.domain} size={24} />
            <div className="min-w-0">
              <div className="truncate text-sm text-foreground">{a.name}</div>
              {a.domain && (
                <div className="truncate text-[10px] text-muted">
                  {a.domain}
                </div>
              )}
              {showMarketChips && a.marketSlugs.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {a.marketSlugs.slice(0, 5).map((slug) => {
                    const label = labelBySlug.get(slug);
                    if (!label) return null;
                    return (
                      <span
                        key={slug}
                        className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded-full bg-white text-zinc-600 border border-zinc-200 whitespace-nowrap"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {label}
                      </span>
                    );
                  })}
                  {a.marketSlugs.length > 5 && (
                    <span className="text-[9px] uppercase tracking-widest px-1.5 py-0.5 text-zinc-500">
                      + {a.marketSlugs.length - 5} more
                    </span>
                  )}
                </div>
              )}
            </div>
            <div
              className="text-right text-sm tabular-nums"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {a.mentions}
            </div>
            <div
              className="text-right text-sm tabular-nums text-emerald-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {a.top3 > 0 ? a.top3 : "—"}
            </div>
            <div
              className="text-right text-sm tabular-nums text-emerald-700"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {a.top1 > 0 ? a.top1 : "—"}
            </div>
          </li>
        ))}
      </ol>
      {agents.length > TOP_N && (
        <div className="px-4 py-2 text-[10px] uppercase tracking-widest text-zinc-400 border-t border-zinc-100 bg-white">
          {agents.length - TOP_N} more agents off the top {TOP_N}
        </div>
      )}
    </div>
  );
}
