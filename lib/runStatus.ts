import { mmrClient } from "./db/mmrClient";

/**
 * In-flight run state for a single market — drives the "Run in progress"
 * badge on the page. Returns null when there's nothing running, so the
 * caller can render `null && <Badge />` without further checks.
 *
 * Reads the most-recent mmr_runs row by scheduled_for and inspects its
 * status. If running OR pending, fan out a count of mmr_responses rows
 * already written so the badge can show "53 / 93" progress.
 *
 * Pessimistic on "ok" — if status is 'running' but every expected
 * response has already landed, we still report running. The
 * scoreMarket completion UPDATE is what flips status; if that hasn't
 * fired yet the run isn't truly done.
 */

export type RunStatus = {
  scheduledFor: string;
  startedAt: string | null;
  responsesSoFar: number;
  expectedTotal: number;
};

// 31 queries × 3 models. Hard-coded because it's a derived constant of
// the canonical querySet + the FETCHERS map in scoreMarket.ts. If either
// changes, update this too — the badge will still render, the percentage
// will just look off until you do.
export const EXPECTED_RESPONSES_PER_MARKET = 93;

export async function getActiveRunStatus(
  marketSlug: string,
): Promise<RunStatus | null> {
  if (marketSlug === "all") return null;
  const sb = mmrClient();
  const { data: market } = await sb
    .from("mmr_markets")
    .select("market_id")
    .eq("slug", marketSlug)
    .maybeSingle();
  if (!market) return null;

  const { data: run } = await sb
    .from("mmr_runs")
    .select("run_id, status, scheduled_for, started_at")
    .eq("market_id", market.market_id)
    .order("scheduled_for", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;
  if (run.status !== "running" && run.status !== "pending") return null;

  const { count } = await sb
    .from("mmr_responses")
    .select("response_id", { count: "exact", head: true })
    .eq("run_id", run.run_id);

  return {
    scheduledFor: run.scheduled_for as string,
    startedAt: (run.started_at as string | null) ?? null,
    responsesSoFar: count ?? 0,
    expectedTotal: EXPECTED_RESPONSES_PER_MARKET,
  };
}
