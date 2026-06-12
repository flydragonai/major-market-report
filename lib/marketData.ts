import { mmrClient } from "./db/mmrClient";
import {
  classifyCitation,
  type Citation,
} from "./citations/categories";
import {
  applyOverride,
  loadDomainOverrides,
  type OverrideMap,
} from "./citations/overrides";
import type { RankedAgent } from "./types";
import { MARKETS, type Market } from "./markets";
import {
  aggregateTopDomains,
  type CitedDomain,
} from "./citations/topDomains";

/** Citation tagged with the LLM that surfaced it — drives the platform
 *  filter pills on the Citation Analysis section. */
export type CitationCite = Citation & { model: string };

/**
 * Server-side loader for the Major Market Report.
 *
 * Reads from the clean, separated mmr_* tables — never from customer
 * scoring tables. Market data and client data stay strictly apart per
 * the design decision; the report intentionally lights up only when
 * monthly market scoring lands rows in mmr_runs / mmr_responses.
 *
 * Pipeline:
 *   1. Pull every complete (non-archived) mmr_runs row + its market join.
 *   2. Fetch every mmr_responses row for those runs in chunks (PostgREST
 *      caps at 1000 rows per response).
 *   3. Reclassify citations on read so the report reflects the CURRENT
 *      classifier registry, not what was frozen at write time.
 *   4. Aggregate two ways: cross-market ("All") and per-market.
 *
 * Read-only — never writes.
 */

const IN_CHUNK_SIZE = 15;

async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetchChunk: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const results = await Promise.all(chunks.map(fetchChunk));
  return results.flat();
}

// ---------- Row + bucket types ----------

type RankedListRow = {
  runId: string;
  market: Market;
  model: string;
  ranked: RankedAgent[];
  /** Citations tagged with the LLM that surfaced them — the model field is
   *  redundant at this granularity (all citations in a row share it) but
   *  carrying it through means the aggregate stays a flat CitationCite[]. */
  citations: CitationCite[];
};

export type AgentRow = {
  name: string;
  domain: string | null;
  mentions: number;
  top3: number;
  top1: number;
  marketSlugs: string[];
};

/** Per-platform tally for the SummaryCards "Queries by platform" card. */
export type PlatformQueryCount = {
  /** Model slug — "openai" / "gemini" / "google_aio". UI maps to display
   *  label via PLATFORM_LABEL in CitationAnalysisSection. */
  model: string;
  /** Count of non-error response rows for this model in the bucket's
   *  scope (cross-market for `all`, this-market only for per-market). */
  count: number;
};

export type MarketBucket = {
  market: Market;
  resultCount: number;
  responseCount: number;
  citations: CitationCite[];
  /** Pre-computed top-20 citation domains for the "All platforms" view.
   *  Per-platform domains are re-aggregated client-side via
   *  aggregateTopDomains() so the share denominators reflect the active
   *  platform's citation universe. */
  topCitedDomains: CitedDomain[];
  agents: AgentRow[];
  /** Per-platform response counts in this bucket's scope. Drives the
   *  "Queries by platform" summary card. Sorted desc by count. */
  perPlatformQueries: PlatformQueryCount[];
};

export type MarketReport = {
  all: MarketBucket;
  perMarket: MarketBucket[];
};

// ---------- Loader ----------

/** Unclassified domain row — drives the bottom-of-page triage section. */
export type UnclassifiedDomain = {
  domain: string;
  count: number;
  sampleUrl: string;
  sampleTitle: string | null;
};

/** Cited domain row for the /citations management page. One entry per
 *  distinct registrable domain seen across every complete run. `kind` is
 *  the EFFECTIVE kind (operator override wins over classifier registry),
 *  and `hasOverride` lets the UI flag rows the operator has already
 *  manually decided so they're visually distinct from the classifier's
 *  guesses. */
export type DomainCatalogRow = {
  domain: string;
  count: number;
  sampleUrl: string;
  sampleTitle: string | null;
  kind: import("./citations/categories").CitationKind;
  brand: string | null;
  hasOverride: boolean;
};

export async function loadMarketReport(): Promise<MarketReport> {
  const sb = mmrClient();

  // Overrides loaded once and threaded into the per-row classifier so a
  // single page render reflects every saved decision without a backfill.
  const overrides = await loadDomainOverrides();

  // Step 1: complete runs, joined to their market via slug. The slug on
  // mmr_markets is the source of truth — we trust it over local
  // lib/markets.ts when the two differ (a market could be renamed in DB
  // without a code redeploy).
  const { data: runRows, error: runErr } = await sb
    .from("mmr_runs")
    .select(
      "run_id, mmr_markets!inner(slug, label, town, state)",
    )
    .eq("status", "complete")
    .eq("archived", false);
  if (runErr) throw new Error(`loadMarketReport runs: ${runErr.message}`);

  // Step 2: map run_id → Market, resolving against the local watchlist.
  // Drop runs whose market slug isn't in MARKETS — that means it's been
  // de-listed in code but a row still exists; we shouldn't surface it.
  // Supabase types embedded selects as arrays even when the FK guarantees
  // one row (the !inner only guarantees existence, not cardinality at the
  // type level), so we pluck [0].
  const runMarket = new Map<string, Market>();
  for (const r of runRows ?? []) {
    const joined = (r as { mmr_markets: { slug: string } | { slug: string }[] })
      .mmr_markets;
    const slug = Array.isArray(joined) ? joined[0]?.slug : joined?.slug;
    if (!slug) continue;
    const market = MARKETS.find((m) => m.slug === slug);
    if (!market) continue;
    runMarket.set((r as { run_id: string }).run_id, market);
  }
  const runIds = Array.from(runMarket.keys());

  // Step 3: response rows for those runs, chunked to dodge the 1000-row cap.
  const responses = await fetchInChunks(runIds, IN_CHUNK_SIZE, async (chunk) => {
    const { data, error } = await sb
      .from("mmr_responses")
      .select("run_id, model, status, ranked, citations")
      .in("run_id", chunk);
    if (error) throw new Error(`loadMarketReport responses: ${error.message}`);
    return (data ?? []) as Array<{
      run_id: string;
      model: string;
      status: string;
      ranked: unknown;
      citations: unknown;
    }>;
  });

  // Step 4: shape into per-row records, dropping errored model rows.
  const rows: RankedListRow[] = [];
  for (const row of responses) {
    if (row.status === "error") continue;
    const market = runMarket.get(row.run_id);
    if (!market) continue;
    const ranked = Array.isArray(row.ranked)
      ? (row.ranked as RankedAgent[])
      : [];
    // Reclassify on read so the report reflects the CURRENT classifier.
    // Then layer the operator's overrides on top — a saved decision wins
    // over the hardcoded registry. Each citation gets tagged with the
    // originating model so the platform filter on the Citation Analysis
    // section can slice by it.
    const citations: CitationCite[] = Array.isArray(row.citations)
      ? (row.citations as Citation[]).map((c) => applyOne(c, row.model, overrides))
      : [];
    rows.push({
      runId: row.run_id,
      market,
      model: row.model,
      ranked,
      citations,
    });
  }

  // Step 5: aggregate. Cross-market ("All") + per-market.
  const all = aggregate(rows, null);
  const perMarket = MARKETS.map((m) =>
    aggregate(
      rows.filter((r) => r.market.slug === m.slug),
      m,
    ),
  );
  return { all, perMarket };
}

// ---------- Aggregation ----------

function aggregate(rows: RankedListRow[], scope: Market | null): MarketBucket {
  const agentByKey = new Map<
    string,
    {
      name: string;
      /** Per-domain occurrence count across every (model × query × run)
       *  row for this agent. The canonical domain on the leaderboard is
       *  the MODE — most-frequently-cited domain wins. Per-row "first
       *  non-null wins" was producing wrong answers because LLMs that
       *  emit the literal string "null" as JSON (Gemini did this for ~50%
       *  of Miami) poisoned the bucket: the truthiness check `if
       *  (!e.domain)` treated "null" as truthy and never overwrote. */
      domainCounts: Map<string, number>;
      mentions: number;
      top3: number;
      top1: number;
      marketSlugs: Set<string>;
    }
  >();
  const citations: CitationCite[] = [];
  const resultIds = new Set<string>();
  // Per-model response counts. Each RankedListRow is one (run × model
  // × query) tuple by construction (see loadMarketReport step 4), so
  // tallying rows by model gives us exactly "queries run per platform"
  // — no double-counting from citation arrays.
  const perModelCount = new Map<string, number>();

  for (const row of rows) {
    resultIds.add(row.runId);
    citations.push(...row.citations);
    perModelCount.set(row.model, (perModelCount.get(row.model) ?? 0) + 1);
    for (const a of row.ranked) {
      const rawName = a.name?.trim();
      if (!rawName) continue;
      const key = rawName.toLowerCase();
      const e =
        agentByKey.get(key) ?? {
          name: rawName,
          domainCounts: new Map<string, number>(),
          mentions: 0,
          top3: 0,
          top1: 0,
          marketSlugs: new Set<string>(),
        };
      e.mentions += 1;
      if (a.rank <= 3) e.top3 += 1;
      if (a.rank === 1) e.top1 += 1;
      // Tally domains across rows. cleanDomainValue strips noise: literal
      // "null"/"undefined", empty strings, scheme/path/www prefixes.
      const cleanDomain = cleanDomainValue(a.domain);
      if (cleanDomain) {
        e.domainCounts.set(
          cleanDomain,
          (e.domainCounts.get(cleanDomain) ?? 0) + 1,
        );
      }
      e.marketSlugs.add(row.market.slug);
      agentByKey.set(key, e);
    }
  }

  const agents: AgentRow[] = Array.from(agentByKey.values())
    .map((v) => ({
      name: v.name,
      domain: modeOfDomain(v.domainCounts),
      mentions: v.mentions,
      top3: v.top3,
      top1: v.top1,
      marketSlugs: Array.from(v.marketSlugs).sort(),
    }))
    .sort(rankAgent);

  const perPlatformQueries: PlatformQueryCount[] = Array.from(
    perModelCount.entries(),
  )
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => b.count - a.count || a.model.localeCompare(b.model));

  return {
    market: scope ?? syntheticAllMarket(),
    resultCount: resultIds.size,
    responseCount: rows.length,
    citations,
    topCitedDomains: aggregateTopDomains(citations),
    agents,
    perPlatformQueries,
  };
}

/** Classify a single citation: run the hardcoded classifier, then let an
 *  operator override (if one exists) replace the kind/brand. The override
 *  always wins — saved decisions are the source of truth. */
function applyOne(
  c: Citation,
  model: string,
  overrides: OverrideMap,
): CitationCite {
  const { kind, brand } = classifyCitation(c);
  const override = applyOverride(c.domain, overrides);
  return {
    ...c,
    kind: override?.kind ?? kind,
    brand: override?.brand ?? brand,
    model,
  };
}

/**
 * Loader for the /citations domain-management page. Scans every
 * complete (non-archived) run's citations and returns one row per
 * distinct domain — with the EFFECTIVE classification (operator
 * override wins over the hardcoded registry) and a flag for whether
 * the row is an override or a classifier guess.
 *
 * Doesn't share loadMarketReport's pipeline because we don't need
 * agent aggregation, per-market splits, or top-domains computation
 * here — just citations grouped by domain. Keeps the page render
 * cheap when the operator is bulk-classifying.
 */
export async function loadDomainCatalog(): Promise<DomainCatalogRow[]> {
  const sb = mmrClient();
  const overrides = await loadDomainOverrides();

  const { data: runRows, error: runErr } = await sb
    .from("mmr_runs")
    .select("run_id")
    .eq("status", "complete")
    .eq("archived", false);
  if (runErr) {
    throw new Error(`loadDomainCatalog runs: ${runErr.message}`);
  }
  const runIds = (runRows ?? []).map((r) => (r as { run_id: string }).run_id);

  const responses = await fetchInChunks(runIds, IN_CHUNK_SIZE, async (chunk) => {
    const { data, error } = await sb
      .from("mmr_responses")
      .select("status, citations")
      .in("run_id", chunk);
    if (error) {
      throw new Error(`loadDomainCatalog responses: ${error.message}`);
    }
    return (data ?? []) as Array<{ status: string; citations: unknown }>;
  });

  // Group raw citations by normalized domain, tallying counts and
  // capturing a sample URL/title for the operator to spot-check
  // before classifying. Classifier kind is sampled from the first
  // citation we see for a domain — classifier is deterministic per
  // (url, domain, title), and all rows for one domain converge on
  // the same kind/brand in practice, so first-seen is correct.
  const acc = new Map<
    string,
    {
      count: number;
      sampleUrl: string;
      sampleTitle: string | null;
      classifierKind: import("./citations/categories").CitationKind;
      classifierBrand: string | null;
    }
  >();
  for (const row of responses) {
    if (row.status === "error") continue;
    if (!Array.isArray(row.citations)) continue;
    for (const c of row.citations as Citation[]) {
      const d = (c.domain ?? "").toLowerCase().replace(/^www\./, "");
      if (!d) continue;
      const e = acc.get(d);
      if (e) {
        e.count += 1;
      } else {
        const { kind, brand } = classifyCitation(c);
        acc.set(d, {
          count: 1,
          sampleUrl: c.url,
          sampleTitle: c.title,
          classifierKind: kind,
          classifierBrand: brand,
        });
      }
    }
  }

  return Array.from(acc.entries())
    .map(([domain, v]) => {
      const override = applyOverride(domain, overrides);
      return {
        domain,
        count: v.count,
        sampleUrl: v.sampleUrl,
        sampleTitle: v.sampleTitle,
        kind: override?.kind ?? v.classifierKind,
        brand: override?.brand ?? v.classifierBrand,
        hasOverride: Boolean(override),
      };
    })
    .sort(
      (a, b) => b.count - a.count || a.domain.localeCompare(b.domain),
    );
}

/** Aggregate all unclassified citations across the whole report into a
 *  flat domain list, sorted by occurrence. Drives the in-app triage
 *  section at the bottom of the page. */
export function unclassifiedDomains(
  citations: CitationCite[],
): UnclassifiedDomain[] {
  const acc = new Map<
    string,
    { count: number; sampleUrl: string; sampleTitle: string | null }
  >();
  for (const c of citations) {
    if (c.kind !== "unclassified") continue;
    const d = (c.domain ?? "").toLowerCase().replace(/^www\./, "");
    if (!d) continue;
    const e =
      acc.get(d) ??
      { count: 0, sampleUrl: c.url, sampleTitle: c.title };
    e.count += 1;
    acc.set(d, e);
  }
  return Array.from(acc.entries())
    .map(([domain, v]) => ({ domain, ...v }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

/** Sort comparator: mentions desc → top3 desc → #1 desc → name asc. */
export function rankAgent(a: AgentRow, b: AgentRow): number {
  if (b.mentions !== a.mentions) return b.mentions - a.mentions;
  if (b.top3 !== a.top3) return b.top3 - a.top3;
  if (b.top1 !== a.top1) return b.top1 - a.top1;
  return a.name.localeCompare(b.name);
}

/** Drop noise from an LLM-returned domain value before we tally it.
 *  Some models emit the literal string "null" / "undefined" instead of a
 *  real JSON null; some include scheme/path/www. Normalize to a bare host
 *  in lowercase so per-row tallies collapse correctly. Returns null when
 *  there's nothing real to tally. */
function cleanDomainValue(d: unknown): string | null {
  if (typeof d !== "string") return null;
  const t = d.trim().toLowerCase();
  if (!t || t === "null" || t === "undefined" || t === "none") return null;
  const host = t
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .trim();
  return host || null;
}

/** Pick the most-frequent domain in a counter. Ties resolve alphabetically
 *  so the leaderboard is deterministic across renders. Returns null when
 *  the agent never had any non-null domain reported. */
function modeOfDomain(counts: Map<string, number>): string | null {
  if (counts.size === 0) return null;
  let bestDom: string | null = null;
  let bestN = -1;
  for (const [dom, n] of counts) {
    if (n > bestN || (n === bestN && (bestDom === null || dom < bestDom))) {
      bestDom = dom;
      bestN = n;
    }
  }
  return bestDom;
}

function syntheticAllMarket(): Market {
  return {
    slug: "all",
    label: "All markets",
    town: "",
    state: "",
  };
}
