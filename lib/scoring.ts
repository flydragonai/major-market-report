import type { RankedAgent } from "./types";
import { domainsMatch, namesMatch } from "./domain";

/**
 * The maximum points a single model can award given how many agents it returned.
 * Capped at 10. A model that returns 0 agents contributes 0 to the run's max.
 */
export function maxPointsForList(listCount: number): number {
  if (!Number.isFinite(listCount) || listCount <= 0) return 0;
  return Math.min(listCount, 10);
}

/**
 * Score a prospect's rank inside a single model's list. Top of an N-agent list
 * (N capped at 10) is worth N points; the next is N-1; …down to 1 at the bottom.
 * Rank #1 in a 10-agent list scores 10. Rank #1 in a 3-agent list scores 3.
 * No match → 0.
 */
export function scoreFromRank(rank: number | null, listCount: number): number {
  if (rank === null) return 0;
  const max = maxPointsForList(listCount);
  if (rank < 1 || rank > max) return 0;
  return max + 1 - rank;
}

export type MatchMethod = "domain" | "name" | null;

export type MatchResult = {
  rank: number | null;
  method: MatchMethod;
};

/**
 * Find the prospect's best (lowest) rank in a list. Domain match wins over
 * name match when both fire at different ranks; otherwise best rank wins.
 */
export function findProspectMatch(
  ranked: RankedAgent[],
  prospectDomain: string,
  prospectName: string,
): MatchResult {
  let bestDomain: number | null = null;
  let bestName: number | null = null;

  for (const r of ranked) {
    if (domainsMatch(r.domain, prospectDomain)) {
      if (bestDomain === null || r.rank < bestDomain) bestDomain = r.rank;
    } else if (namesMatch(prospectName, r.name)) {
      if (bestName === null || r.rank < bestName) bestName = r.rank;
    }
  }

  if (bestDomain !== null && bestName !== null) {
    if (bestDomain <= bestName) return { rank: bestDomain, method: "domain" };
    return { rank: bestName, method: "name" };
  }
  if (bestDomain !== null) return { rank: bestDomain, method: "domain" };
  if (bestName !== null) return { rank: bestName, method: "name" };
  return { rank: null, method: null };
}
