import type { ModelId } from "../types";
import {
  classifyCitation,
  type Citation,
} from "../citations/categories";

export type { Citation };

/**
 * Extract normalized web-search citations from a raw LLM response. One entry
 * per source the LLM grounded on. Provider-agnostic output shape lets
 * downstream analytics query across models without caring about each
 * provider's raw response layout. `kind` + `brand` are assigned by the
 * classifier in `../citations/categories` at extraction time so downstream
 * code doesn't have to re-parse URLs.
 */
export function extractCitations(model: ModelId, raw: unknown): Citation[] {
  if (!raw || typeof raw !== "object") return [];
  try {
    let raws: RawCitation[];
    switch (model) {
      case "openai":
        raws = dedupeByUrl(extractOpenAI(raw));
        break;
      case "gemini":
        raws = dedupeByUrl(extractGemini(raw));
        break;
      case "anthropic":
        raws = dedupeByUrl(extractAnthropic(raw));
        break;
      case "google_aio":
        raws = dedupeByUrl(extractDataForSEO(raw));
        break;
      default:
        return [];
    }
    return raws.map((c) => {
      const { kind, brand } = classifyCitation(c);
      return { ...c, kind, brand };
    });
  } catch {
    // Each provider's response shape drifts over time. We'd rather store an
    // empty list than crash a run because of a one-off schema change.
    return [];
  }
}

/** Pre-classification shape used internally between extractors and the
 * classifier. The exported Citation type is the classified version. */
type RawCitation = {
  title: string | null;
  url: string;
  domain: string | null;
};

/**
 * OpenAI Responses API with web_search tool. Two relevant surfaces in
 * `output[]`:
 *   - `url_citation` annotations on message text content — the subset the
 *     model cited inline. These carry titles.
 *   - `web_search_call.action.sources[]`: every source the model consulted
 *     (a superset — the broader "considered" set). Only present when the
 *     request sets `include: ["web_search_call.action.sources"]`. Each entry
 *     is `{ type, url }` with NO title.
 * We collect both. Cited (title-bearing) entries are returned first so the
 * caller's dedupeByUrl keeps the title when a URL appears in both — matching
 * the Anthropic extractor.
 */
function extractOpenAI(raw: unknown): RawCitation[] {
  const r = raw as Record<string, unknown>;
  const output = r.output;
  if (!Array.isArray(output)) return [];
  const cited: RawCitation[] = [];
  const sources: RawCitation[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;

    // Inline url_citation annotations (have titles).
    const content = it.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (!c || typeof c !== "object") continue;
        const annotations = (c as Record<string, unknown>).annotations;
        if (!Array.isArray(annotations)) continue;
        for (const ann of annotations) {
          if (!ann || typeof ann !== "object") continue;
          const a = ann as Record<string, unknown>;
          if (a.type !== "url_citation") continue;
          const url = typeof a.url === "string" ? a.url : null;
          if (!url) continue;
          cited.push({
            title: typeof a.title === "string" ? a.title : null,
            url,
            domain: safeDomain(url),
          });
        }
      }
    }

    // Broader consulted sources (url only, no title).
    if (it.type === "web_search_call") {
      const action = it.action as Record<string, unknown> | undefined;
      const srcs = action?.sources;
      if (Array.isArray(srcs)) {
        for (const s of srcs) {
          if (!s || typeof s !== "object") continue;
          const url = (s as Record<string, unknown>).url;
          if (typeof url !== "string" || !url) continue;
          sources.push({ title: null, url, domain: safeDomain(url) });
        }
      }
    }
  }
  return [...cited, ...sources];
}

/**
 * Gemini generateContent with google_search tool.
 * Sources live in candidates[0].groundingMetadata.groundingChunks, each as
 * { web: { uri, title } }. The URIs are often Vertex AI redirect URLs — we
 * store them as-is so callers can resolve later if needed.
 */
function extractGemini(raw: unknown): RawCitation[] {
  const r = raw as Record<string, unknown>;
  const candidates = r.candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const first = candidates[0] as Record<string, unknown>;
  const gm = first.groundingMetadata as Record<string, unknown> | undefined;
  if (!gm) return [];
  const chunks = gm.groundingChunks;
  if (!Array.isArray(chunks)) return [];
  const cites: RawCitation[] = [];
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== "object") continue;
    const web = (chunk as Record<string, unknown>).web as
      | Record<string, unknown>
      | undefined;
    if (!web) continue;
    const url = typeof web.uri === "string" ? web.uri : null;
    if (!url) continue;
    cites.push({
      title: typeof web.title === "string" ? web.title : null,
      url,
      domain: safeDomain(url),
    });
  }
  return cites;
}

/**
 * Anthropic Messages API with web_search tool.
 * Two relevant block types in `content[]`:
 *   - `web_search_tool_result.content[]`: every result the tool returned
 *     (a superset — what Claude *could* have used).
 *   - `text.citations[]`: web_search_result_location entries pointing at
 *     specific cited results (the subset actually grounded on inline).
 * We extract both — dedupeByUrl collapses overlap. That gives us "every
 * source considered" while keeping inline citations intact.
 */
function extractAnthropic(raw: unknown): RawCitation[] {
  const r = raw as Record<string, unknown>;
  const content = r.content;
  if (!Array.isArray(content)) return [];
  const cites: RawCitation[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;

    if (b.type === "text" && Array.isArray(b.citations)) {
      for (const cite of b.citations) {
        if (!cite || typeof cite !== "object") continue;
        const c = cite as Record<string, unknown>;
        if (c.type !== "web_search_result_location") continue;
        const url = typeof c.url === "string" ? c.url : null;
        if (!url) continue;
        cites.push({
          title: typeof c.title === "string" ? c.title : null,
          url,
          domain: safeDomain(url),
        });
      }
    }

    if (b.type === "web_search_tool_result") {
      const inner = b.content;
      if (Array.isArray(inner)) {
        for (const result of inner) {
          if (!result || typeof result !== "object") continue;
          const rr = result as Record<string, unknown>;
          if (rr.type !== "web_search_result") continue;
          const url = typeof rr.url === "string" ? rr.url : null;
          if (!url) continue;
          cites.push({
            title: typeof rr.title === "string" ? rr.title : null,
            url,
            domain: safeDomain(url),
          });
        }
      }
    }
  }
  return cites;
}

/**
 * DataForSEO Google AI Overview response. Walks tasks→result→items[type=
 * ai_overview], collecting `ai_overview_reference` entries from both the
 * top-level references[] and the nested items[type=ai_overview_element].
 * Each reference already has url + title + domain pre-extracted by
 * DataForSEO, so the mapping is direct.
 *
 * Mirrors lib/llms/dataforseo.ts extractReferences() — kept separate
 * because the provider file builds a slightly different shape (ranked
 * agents) and we don't want to thread one through the other.
 */
function extractDataForSEO(raw: unknown): RawCitation[] {
  const cites: RawCitation[] = [];
  const tasks = (raw as Record<string, unknown>)?.tasks;
  if (!Array.isArray(tasks)) return cites;

  for (const task of tasks) {
    const results = (task as Record<string, unknown>)?.result;
    if (!Array.isArray(results)) continue;
    for (const result of results) {
      const items = (result as Record<string, unknown>)?.items;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const it = item as Record<string, unknown>;
        if (it.type !== "ai_overview") continue;
        pushAioRefs(it.references, cites);
        const inner = it.items;
        if (Array.isArray(inner)) {
          for (const el of inner) {
            if (!el || typeof el !== "object") continue;
            pushAioRefs((el as Record<string, unknown>).references, cites);
          }
        }
      }
    }
  }
  return cites;
}

function pushAioRefs(raw: unknown, out: RawCitation[]): void {
  if (!Array.isArray(raw)) return;
  for (const ref of raw) {
    if (!ref || typeof ref !== "object") continue;
    const r = ref as Record<string, unknown>;
    if (r.type !== "ai_overview_reference") continue;
    const url = typeof r.url === "string" ? r.url : null;
    if (!url) continue;
    out.push({
      title: typeof r.title === "string" ? r.title : null,
      url,
      domain:
        typeof r.domain === "string" && r.domain
          ? r.domain.toLowerCase().replace(/^www\./, "")
          : safeDomain(url),
    });
  }
}

function safeDomain(url: string): string | null {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function dedupeByUrl(cites: RawCitation[]): RawCitation[] {
  const seen = new Set<string>();
  const out: RawCitation[] = [];
  for (const c of cites) {
    if (!c.url || seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}
