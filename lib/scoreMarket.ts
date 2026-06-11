import { mmrClient } from "./db/mmrClient";
import { buildQuerySet } from "./llms/querySet";
import { extractCitations } from "./llms/citations";
import { resolveCitationRedirects } from "./llms/resolveRedirect";
import { fetchOpenAI } from "./llms/openai";
import { fetchGemini } from "./llms/gemini";
import { fetchDataForSEO } from "./llms/dataforseo";
import type { ModelId } from "./types";

/**
 * Server-side scoring orchestrator for one market. Fires the canonical
 * customer-reporting query set (5 variants × 6 subjects + 1 one-off = 31
 * queries) against each of three models — OpenAI / Gemini / Google AIO —
 * writes responses to mmr_responses, and marks the parent mmr_runs row
 * complete.
 *
 * Designed to be called from a server action — runs synchronously and
 * returns when the market is done. Idempotent: scheduled_for defaults to
 * the 1st of the current month, and mmr_runs has UNIQUE
 * (market_id, scheduled_for), so re-running same-month is a no-op unless
 * `force = true`.
 *
 * Anthropic intentionally excluded — it's an add-on model in the
 * customer-reporting STANDARD set too (Claude is paid tier). Add it to
 * FETCHERS if you decide to opt in per market.
 */

const FETCHERS: Record<string, (q: string) => Promise<{ raw: unknown; ranked: unknown[] }>> = {
  openai: fetchOpenAI,
  gemini: fetchGemini,
  google_aio: fetchDataForSEO,
};

const CONCURRENCY = 5;

type ResolvedMarket = {
  market_id: number;
  slug: string;
  label: string;
  town: string;
  state: string;
};

/**
 * Quick synchronous prelude — resolves the market, checks for skip, and
 * upserts the mmr_runs row in `running` state. Returns the runId so the
 * caller can kick off `fireMarketScoring` in the background and the UI's
 * status badge can pick up the new row on its next poll within
 * milliseconds.
 *
 * Split from the full pipeline so the server action can return fast and
 * the operator sees the progress bar appear immediately on click instead
 * of waiting for the entire LLM fan-out to complete.
 */
export async function startMarketRun(
  slug: string,
  opts: { force?: boolean } = {},
): Promise<
  | { status: "started"; runId: string; market: ResolvedMarket; scheduledFor: string }
  | { status: "skipped"; runId: string; market: ResolvedMarket; message: string }
  | { status: "error"; message: string }
> {
  const sb = mmrClient();

  const { data: market, error: mErr } = await sb
    .from("mmr_markets")
    .select("market_id, slug, label, town, state")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();
  if (mErr) return { status: "error", message: `scoreMarket: ${mErr.message}` };
  if (!market) return { status: "error", message: "Market not found or not active." };

  const scheduledFor = firstOfMonthIso();

  if (!opts.force) {
    const { data: existing } = await sb
      .from("mmr_runs")
      .select("run_id, status")
      .eq("market_id", market.market_id)
      .eq("scheduled_for", scheduledFor)
      .maybeSingle();
    if (existing && existing.status === "complete") {
      return {
        status: "skipped",
        runId: existing.run_id,
        market: market as ResolvedMarket,
        message: `Already complete for ${scheduledFor} — pass force to re-run.`,
      };
    }
    if (existing && existing.status === "running") {
      return {
        status: "skipped",
        runId: existing.run_id,
        market: market as ResolvedMarket,
        message: `Already running — watch the progress bar.`,
      };
    }
  }

  const { data: run, error: rErr } = await sb
    .from("mmr_runs")
    .upsert(
      {
        market_id: market.market_id,
        scheduled_for: scheduledFor,
        status: "running",
        started_at: new Date().toISOString(),
        error_text: null,
      },
      { onConflict: "market_id,scheduled_for" },
    )
    .select("run_id")
    .single();
  if (rErr || !run) throw rErr ?? new Error("no run row");

  return {
    status: "started",
    runId: run.run_id as string,
    market: market as ResolvedMarket,
    scheduledFor,
  };
}

/**
 * Slow phase — fires every (query × model) task in a bounded pool, writes
 * responses to mmr_responses, marks the run complete (or error) when done.
 * Designed to be invoked in the background by the server action so the
 * client gets the runId back immediately and the progress UI updates
 * in real time via polling.
 *
 * Catches its own errors — the background promise never rejects up to
 * the caller (which has already returned). Failures land in
 * mmr_runs.error_text + status='error' so the operator can see them in
 * the UI.
 */
export async function fireMarketScoring(
  runId: string,
  market: ResolvedMarket,
  opts: { mock?: boolean } = {},
): Promise<void> {
  const sb = mmrClient();

  const queries = buildQuerySet(`${market.town}, ${market.state}`);
  const models = Object.keys(FETCHERS);
  const tasks: { q: (typeof queries)[number]; m: string }[] = [];
  for (const q of queries) for (const m of models) tasks.push({ q, m });

  let fired = 0;
  let errors = 0;
  await pool(tasks, CONCURRENCY, async ({ q, m }) => {
    const t0 = Date.now();
    try {
      let raw: unknown;
      let ranked: unknown[];
      if (opts.mock) {
        raw = { mock: true, query: q.text };
        ranked = [
          {
            rank: 1,
            name: `Mock Top Agent — ${market.label}`,
            domain: "example.com",
            url: null,
          },
        ];
      } else {
        const res = await FETCHERS[m](q.text);
        raw = res.raw;
        ranked = res.ranked;
      }
      // Resolve Gemini grounding redirects to their actual publishers BEFORE
      // storing — without this every Gemini citation lands as
      // vertexaisearch.cloud.google.com and the Top Cited Domains list goes
      // garbage. No-op for OpenAI / AIO. Unresolvable redirects fall through
      // intact, so a flaky network can't drop legitimate citations.
      const citations = opts.mock
        ? []
        : await resolveCitationRedirects(extractCitations(m as ModelId, raw));
      const { error } = await sb.from("mmr_responses").upsert(
        {
          run_id: runId,
          model: m,
          query_id: q.id,
          query_label: q.label,
          query_text: q.text,
          query_set: q.set,
          status: "ok",
          ranked,
          citations,
          raw_response: raw,
          latency_ms: Date.now() - t0,
        },
        { onConflict: "run_id,model,query_id" },
      );
      if (error) throw error;
      fired += 1;
    } catch (e) {
      errors += 1;
      const msg = e instanceof Error ? e.message : String(e);
      await sb.from("mmr_responses").upsert(
        {
          run_id: runId,
          model: m,
          query_id: q.id,
          query_label: q.label,
          query_text: q.text,
          query_set: q.set,
          status: "error",
          error: msg,
          latency_ms: Date.now() - t0,
        },
        { onConflict: "run_id,model,query_id" },
      );
    }
  });

  // Mark the run complete. fired + errors are derived stats; we don't
  // persist them to mmr_runs since they're trivially recomputable from
  // mmr_responses (status='ok' vs status='error').
  void fired;
  void errors;
  await sb
    .from("mmr_runs")
    .update({
      status: "complete",
      completed_at: new Date().toISOString(),
    })
    .eq("run_id", runId);
}

// ---------- helpers ----------

function firstOfMonthIso(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

async function pool<T>(
  items: T[],
  n: number,
  fn: (it: T) => Promise<void>,
): Promise<void> {
  const queue = items.slice();
  const workers = Array.from(
    { length: Math.min(n, queue.length) },
    async () => {
      while (queue.length) {
        const next = queue.shift();
        if (next !== undefined) await fn(next);
      }
    },
  );
  await Promise.all(workers);
}
