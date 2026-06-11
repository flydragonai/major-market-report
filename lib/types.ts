export type ModelId =
  | "openai"
  | "gemini"
  | "anthropic"
  | "google_aio";

/**
 * Every model we know how to run AND display. Drives all read-side surfaces —
 * benchmarks, grids, citation aggregation — so historical data for ANY model
 * (including ones no longer in the standard package) still renders.
 *
 * NOTE: this is NOT the set that runs on a standard scoring pass. The runner
 * uses STANDARD_MODEL_IDS. Keep `anthropic` here so its past runs keep showing.
 */
export const MODEL_IDS: ModelId[] = [
  "openai",
  "gemini",
  "anthropic",
  "google_aio",
];

/**
 * Add-on models pulled OUT of the standard package because they're too
 * expensive to run on every pass. Currently Claude (anthropic). These do not
 * run by default — they're re-enabled explicitly for higher tiers or periodic
 * (e.g. monthly) check-ins by passing them to the runner / backfill route.
 *
 * To move a model in or out of the standard package, change only this list.
 */
export const ADDON_MODEL_IDS: ModelId[] = ["anthropic"];

/**
 * The standard package — models that run on every default scoring pass.
 * Derived as MODEL_IDS minus ADDON_MODEL_IDS so the two can never drift.
 * `runClientScoring` uses this when a caller doesn't pass an explicit set.
 */
export const STANDARD_MODEL_IDS: ModelId[] = MODEL_IDS.filter(
  (m) => !ADDON_MODEL_IDS.includes(m),
);

export const MODEL_LABEL: Record<ModelId, string> = {
  openai: "ChatGPT",
  gemini: "Gemini",
  anthropic: "Claude",
  google_aio: "Google AIO",
};

/**
 * Per-run max score given each model's actual result. A model contributes
 * min(agents_returned, 10) — so a model that returned 0 agents contributes 0,
 * a model that returned 3 contributes 3, a model that returned 10+ contributes 10.
 * Pending models contribute 10 (optimistic placeholder until results land).
 */
export function computeMaxScore(
  models: { status: string; ranked: { rank: number }[] }[],
): number {
  let total = 0;
  for (const m of models) {
    if (m.status === "pending") {
      total += 10; // optimistic placeholder while still running
    } else {
      total += Math.min(m.ranked.length, 10);
    }
  }
  return total;
}

export type RankedAgent = {
  rank: number;
  name: string;
  domain: string | null;
  url: string | null;
};

export type MatchMethod = "domain" | "name" | null;

export type ModelOutcome = {
  model: ModelId;
  status: "ok" | "error" | "no_results";
  error: string | null;
  raw: unknown;
  ranked: RankedAgent[];
  citations: import("./citations/categories").Citation[];
  matchedRank: number | null;
  matchMethod: MatchMethod;
  score: number;
  latencyMs: number;
};

export type RunSummary = {
  runId: string;
  prospect: {
    id: string;
    name: string;
    domain: string;
    market: string;
  };
  models: ModelOutcome[];
  totalScore: number;
  maxScore: number;
  baselineAvg: number | null;
  beatBaseline: boolean | null;
};
