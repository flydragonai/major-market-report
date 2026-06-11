import { rollupDisplayDomain } from "../domain";
import type { Citation, CitationKind } from "./categories";

export type CitedDomain = {
  domain: string;
  /** Total citations of this domain across the included runs. */
  count: number;
  /** Share of all citations this domain accounts for, 0-100. */
  pctOfTotal: number;
  /** Most common CitationKind for this domain (Portal / Agent-owned /
   *  Brokerage / etc.). Useful context — the same domain almost always
   *  classifies the same way, but a mixed bucket shows the dominant. */
  kind: CitationKind | null;
  /** Top URLs cited under this domain, deduplicated and sorted by how many
   *  times each unique URL was cited. Capped so the payload stays small even
   *  on frequently-cited domains. Drives the hover-expand panel beneath each
   *  bar. */
  topUrls: { url: string; title: string | null; count: number }[];
};

/**
 * Roll up a flat citation list into the top-N cited domains. Per domain we
 * track total count, the dominant CitationKind, and the deduped top URLs.
 * Presentation subdomains roll up (m.yelp.com → yelp.com); content subdomains
 * (realestate.usnews.com) stay intact. `pctOfTotal` is relative to the passed
 * citation set — so a platform-filtered view shows that platform's shares.
 *
 * Shared by the server (overview default) and the client (live re-aggregation
 * when a platform pill is active) so both views compute identically.
 */
export function aggregateTopDomains(
  citations: Citation[],
  opts?: { topDomains?: number; topUrlsPerDomain?: number },
): CitedDomain[] {
  const TOP_DOMAINS = opts?.topDomains ?? 20;
  const TOP_URLS_PER_DOMAIN = opts?.topUrlsPerDomain ?? 50;
  const total = citations.length;

  type DomainAgg = {
    count: number;
    kinds: Map<CitationKind, number>;
    urlCounts: Map<string, number>;
    urlTitles: Map<string, string>;
  };
  const domainAgg = new Map<string, DomainAgg>();
  for (const c of citations) {
    const raw = (c.domain ?? "").trim().toLowerCase();
    if (!raw) continue;
    const domain = rollupDisplayDomain(raw);
    const entry: DomainAgg =
      domainAgg.get(domain) ?? {
        count: 0,
        kinds: new Map<CitationKind, number>(),
        urlCounts: new Map<string, number>(),
        urlTitles: new Map<string, string>(),
      };
    entry.count += 1;
    entry.kinds.set(c.kind, (entry.kinds.get(c.kind) ?? 0) + 1);
    if (c.url) {
      entry.urlCounts.set(c.url, (entry.urlCounts.get(c.url) ?? 0) + 1);
      if (c.title && !entry.urlTitles.has(c.url)) {
        entry.urlTitles.set(c.url, c.title);
      }
    }
    domainAgg.set(domain, entry);
  }

  return Array.from(domainAgg.entries())
    .map(([domain, e]) => {
      let dominantKind: CitationKind | null = null;
      let max = 0;
      for (const [k, v] of e.kinds) {
        if (v > max) {
          max = v;
          dominantKind = k;
        }
      }
      const topUrls = Array.from(e.urlCounts.entries())
        .map(([url, count]) => ({
          url,
          title: e.urlTitles.get(url) ?? null,
          count,
        }))
        .sort((a, b) => {
          if (b.count !== a.count) return b.count - a.count;
          return a.url.localeCompare(b.url);
        })
        .slice(0, TOP_URLS_PER_DOMAIN);
      return {
        domain,
        count: e.count,
        pctOfTotal: total > 0 ? (e.count / total) * 100 : 0,
        kind: dominantKind,
        topUrls,
      };
    })
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return a.domain.localeCompare(b.domain);
    })
    .slice(0, TOP_DOMAINS);
}
