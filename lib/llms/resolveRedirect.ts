import { classifyCitation, type Citation } from "../citations/categories";

/**
 * Gemini grounding redirects (vertexaisearch.cloud.google.com/grounding-api-
 * redirect/<token>) hide the real publisher behind an opaque token — they'd
 * otherwise all collapse into one meaningless "vertexaisearch" domain. A
 * single-hop request returns the real destination in the Location header, so
 * we never touch the publisher (no 403/429) and we recover the full URL +
 * path. We then rewrite the citation's url + domain and re-classify from the
 * resolved source.
 *
 * Best-effort: the grounding tokens expire (~30-60d) and the proxy can be
 * slow, so any failure (timeout, expired token, network) leaves the citation
 * untouched rather than dropping it.
 */

const GROUNDING_REDIRECT =
  /vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/i;

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/** Follow one grounding redirect to its destination via the Location header. */
async function resolveOne(
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: ctrl.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    const loc = res.headers.get("location");
    return loc && /^https?:\/\//i.test(loc) ? loc : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve any Gemini grounding-redirect citations to their real destination,
 * re-classifying kind + brand from the resolved URL. Non-redirect citations
 * pass through untouched. Pass a shared `cache` to dedupe identical tokens
 * across a batch (e.g. the same source cited by multiple queries in a run).
 */
export async function resolveCitationRedirects(
  citations: Citation[],
  opts?: { cache?: Map<string, string | null>; timeoutMs?: number },
): Promise<Citation[]> {
  const cache = opts?.cache ?? new Map<string, string | null>();
  const timeoutMs = opts?.timeoutMs ?? 8000;
  return Promise.all(
    citations.map(async (c) => {
      if (!GROUNDING_REDIRECT.test(c.url)) return c;
      let resolved = cache.get(c.url);
      if (resolved === undefined) {
        resolved = await resolveOne(c.url, timeoutMs);
        cache.set(c.url, resolved);
      }
      if (!resolved) return c; // keep original on failure
      const domain = safeDomain(resolved);
      const { kind, brand } = classifyCitation({
        url: resolved,
        domain,
        title: c.title,
      });
      return { ...c, url: resolved, domain, kind, brand };
    }),
  );
}
