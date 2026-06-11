import type { RawFetchResult } from "./index";

/**
 * DataForSEO Google AI Overview (called "AI Mode" in their API namespace).
 * Hits Google as a search query, returns the AI summary markdown + the
 * references Google cited to produce it.
 *
 * IMPORTANT semantics shift from the LLM providers:
 *   - LLMs return a structured JSON list of agent names. We score by
 *     matching the prospect against that list.
 *   - AIO returns prose markdown that may or may not name specific
 *     agents. We parse the markdown for agent-name patterns (numbered
 *     lists first, bullets next, bold-name fallback) and treat those as
 *     the synthesized "ranked" list. References stay separate — they're
 *     surfaced only via the citations extractor for the citation mix.
 *
 *   If the markdown doesn't name specific agents (e.g. Google answered
 *   with generic advice), `ranked` is empty and the row gets
 *   status='no_results' upstream. That's semantically correct — AIO
 *   "didn't mention any agents," not "AIO returned 30 sources but our
 *   prospect wasn't one of them."
 *
 * Auth: HTTP Basic with DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD. Location
 * is hardcoded to US (location_code 2840) — geo targeting comes from the
 * query text, same as the LLMs.
 */
export async function fetchDataForSEO(query: string): Promise<RawFetchResult> {
  const login = process.env.DATAFORSEO_LOGIN;
  const password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) {
    throw new Error("DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD must be set");
  }
  const auth = Buffer.from(`${login}:${password}`).toString("base64");
  const keyword = query;

  const resp = await fetch(
    "https://api.dataforseo.com/v3/serp/google/ai_mode/live/advanced",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify([
        {
          keyword,
          language_code: "en",
          location_code: 2840, // United States
        },
      ]),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`DataForSEO ${resp.status}: ${text.slice(0, 300)}`);
  }

  const raw = (await resp.json()) as unknown;
  const markdown = extractAIOMarkdown(raw);
  const ranked = markdown ? extractRankedAgents(markdown) : [];
  return { raw, ranked };
}

/**
 * Pulls the AI summary markdown out of a DataForSEO ai_mode response.
 * The text can live in `items[? type=ai_overview].markdown` directly or
 * in nested `items[? type=ai_overview_element].markdown` children — we
 * collect both. Used by the provider above AND by the modal's Google
 * AIO tab to show the user what Google actually said.
 */
export function extractAIOMarkdown(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const tasks = (raw as Record<string, unknown>).tasks;
  if (!Array.isArray(tasks)) return null;
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
        if (typeof it.markdown === "string" && it.markdown.trim()) {
          return it.markdown;
        }
        const inner = it.items;
        if (Array.isArray(inner)) {
          const parts: string[] = [];
          for (const el of inner) {
            if (!el || typeof el !== "object") continue;
            const md = (el as Record<string, unknown>).markdown;
            if (typeof md === "string" && md.trim()) parts.push(md);
          }
          if (parts.length > 0) return parts.join("\n\n");
        }
      }
    }
  }
  return null;
}

type Ranked = {
  rank: number;
  name: string;
  domain: string | null;
  url: string | null;
};

/**
 * Heuristic name extraction from AI-summary markdown.
 *
 * Tries (in priority order):
 *   1. Numbered list items — `1. **John Smith**` or `1) John Smith`. Best
 *      signal, since Google's AI usually formats "top N" answers this way.
 *   2. Bulleted list items — `- John Smith`. Less common in AIO output
 *      but seen for shorter recommendation sets.
 *   3. Inline bold names — `**John Smith** is …`. Fallback when the AI
 *      embeds named recommendations in flowing prose.
 *
 * For each candidate we strip surrounding markdown formatting, then
 * verify it looks like a person name (2–4 capitalized words, none in
 * NON_NAME_PHRASES). Deduped, capped at 10 (matches our scoring max).
 *
 * Conservative on purpose: if AIO gave generic advice with no named
 * agents, we return [] rather than synthesizing noise from regex hits
 * inside unrelated prose.
 */
function extractRankedAgents(markdown: string): Ranked[] {
  const numbered = extractFromPattern(
    markdown,
    /^[ \t]*\d+[.)][ \t]+(.+)$/gm,
  );
  if (numbered.length > 0) return numbered;

  const bulleted = extractFromPattern(
    markdown,
    /^[ \t]*[-*+][ \t]+(.+)$/gm,
  );
  if (bulleted.length > 0) return bulleted;

  // Fallback: inline bold names.
  return extractInlineBoldNames(markdown);
}

function extractFromPattern(markdown: string, lineRegex: RegExp): Ranked[] {
  const out: Ranked[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = lineRegex.exec(markdown)) !== null) {
    const itemText = m[1].trim();
    const name = nameFromItemText(itemText);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rank: out.length + 1,
      name,
      domain: null,
      url: null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

function extractInlineBoldNames(markdown: string): Ranked[] {
  const out: Ranked[] = [];
  const seen = new Set<string>();
  const re = /\*\*([^*]+?)\*\*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const candidate = m[1].trim();
    const name = sanitizeNameCandidate(candidate);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rank: out.length + 1,
      name,
      domain: null,
      url: null,
    });
    if (out.length >= 10) break;
  }
  return out;
}

/**
 * From "**John Smith** (Compass) is an experienced agent...", returns
 * "John Smith". Strips markdown formatting + truncates at common
 * sentence/clause breaks ("," ".", ":", "(", "-", "—").
 */
function nameFromItemText(text: string): string | null {
  // Strip common inline markdown so we can read the prose.
  let t = text;
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // [name](url) → name
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1"); // **name** → name
  t = t.replace(/__([^_]+)__/g, "$1"); // __name__ → name
  t = t.replace(/`([^`]+)`/g, "$1"); // `name` → name
  // Italic last (single * / _) so it doesn't eat the bold delimiters.
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  return sanitizeNameCandidate(t);
}

function sanitizeNameCandidate(raw: string): string | null {
  const t = raw.trim();
  // Take the leading 2-4 capitalized words before any clause break.
  const m = t.match(
    /^([A-Z][a-zA-Z'’\-]{1,}(?:\s+[A-Z][a-zA-Z'’\-]{1,}){1,3})(?=[\s:,.\-——(]|$)/,
  );
  if (!m) return null;
  const candidate = m[1].trim();
  if (candidate.split(/\s+/).every((w) => w.length < 3)) return null;
  if (NON_NAME_PHRASES.has(candidate.toLowerCase())) return null;
  // Reject if any word is all-uppercase (likely an acronym / brand: KW, MLS).
  if (candidate.split(/\s+/).some((w) => w === w.toUpperCase() && w.length > 1)) {
    return null;
  }
  return candidate;
}

/**
 * Capitalized 2–3 word phrases that look like names but aren't. Kept tight —
 * false positives on real names (matching this list) hurt more than missing
 * a non-name. Add as they show up.
 */
const NON_NAME_PHRASES = new Set([
  "real estate",
  "real estate agent",
  "real estate agents",
  "real estate broker",
  "real estate brokers",
  "top agent",
  "top agents",
  "top realtor",
  "top realtors",
  "best agent",
  "best agents",
  "best realtor",
  "best realtors",
  "the best",
  "the top",
  "ai overview",
  "ai mode",
  "google maps",
  "google business",
  "better business",
  "better business bureau",
  "united states",
  "north america",
  "south america",
  "new york",
  "los angeles",
  "san francisco",
  "san diego",
  "santa fe",
  "santa barbara",
  "santa monica",
  "key west",
  "real trends",
  "fast expert",
  "agent pronto",
]);
