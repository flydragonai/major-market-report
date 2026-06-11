import { fetchOpenAI } from "./openai";
import { fetchGemini } from "./gemini";
import { fetchAnthropic } from "./anthropic";
import { fetchDataForSEO } from "./dataforseo";
import type { ModelId, ModelOutcome } from "../types";
import { findProspectMatch, scoreFromRank } from "../scoring";
import { extractCitations } from "./citations";
import { resolveCitationRedirects } from "./resolveRedirect";

export type RawFetchResult = {
  raw: unknown;
  ranked: { rank: number; name: string; domain: string | null; url: string | null }[];
};

const FETCHERS: Record<
  ModelId,
  (query: string) => Promise<RawFetchResult>
> = {
  openai: fetchOpenAI,
  gemini: fetchGemini,
  anthropic: fetchAnthropic,
  google_aio: fetchDataForSEO,
};

/**
 * Run one model against one fully-rendered query and score the prospect
 * against the returned list. `query` is the exact question (from
 * buildQuerySet) — the per-targeting fan-out across the query set happens in
 * the caller (runClientScoring / backfill).
 */
export async function runModel(
  model: ModelId,
  query: string,
  prospectDomain: string,
  prospectName: string,
): Promise<ModelOutcome> {
  const t0 = Date.now();
  try {
    const { raw, ranked } = await FETCHERS[model](query);
    const match = findProspectMatch(ranked, prospectDomain, prospectName);
    const score = scoreFromRank(match.rank, ranked.length);
    // Resolve Gemini grounding redirects to their real publisher before
    // storing, so citations carry the actual domain (not vertexaisearch).
    // No-op for other models. Best-effort — unresolved ones stay as-is.
    const citations = await resolveCitationRedirects(
      extractCitations(model, raw),
    );
    return {
      model,
      status: ranked.length === 0 ? "no_results" : "ok",
      error: null,
      raw,
      ranked,
      citations,
      matchedRank: match.rank,
      matchMethod: match.method,
      score,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      model,
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      raw: null,
      ranked: [],
      citations: [],
      matchedRank: null,
      matchMethod: null,
      score: 0,
      latencyMs: Date.now() - t0,
    };
  }
}
