import { isKnownPortalOrBrokerage } from "./citations/categories";

/**
 * Base-name tokens we refuse to count as a meaningful substring overlap
 * during fuzzy domain matching. Without this, a prospect domain like
 * `shawnarealtors.com` (base name "shawnarealtors") false-matches against
 * `montanarealtors.com` (base "montanarealtors") because they share the
 * generic 8-char substring "realtors". Same story for any pair sharing
 * "homes", "estate", etc.
 */
const GENERIC_REALESTATE_TOKENS = new Set([
  "realtor",
  "realtors",
  "realty",
  "realestate",
  "home",
  "homes",
  "house",
  "houses",
  "housing",
  "agent",
  "agents",
  "estate",
  "estates",
  "property",
  "properties",
  "broker",
  "brokers",
  "brokerage",
  "team",
  "group",
  "sells",
  "sold",
  "listing",
  "listings",
  "luxury",
  "premier",
  "elite",
  "tophomes",
]);

export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  if (!s) return null;

  s = s.replace(/^https?:\/\//, "");
  s = s.replace(/^www\./, "");
  s = s.split("/")[0];
  s = s.split("?")[0];
  s = s.split("#")[0];
  s = s.replace(/:\d+$/, "");
  s = s.replace(/\.+$/, "");

  if (!s.includes(".")) return null;
  return s;
}

/** The part before the first dot — e.g. timharveyrealestate.com → "timharveyrealestate" */
function baseName(domain: string): string {
  return domain.split(".")[0];
}

/**
 * Leading subdomain labels that are pure presentation — the mobile, AMP, or
 * www variant of the *same* site, not a distinct content property. We strip
 * these when computing a display/grouping key so "m.yelp.com" rolls up into
 * "yelp.com". Deliberately NOT a generic eTLD+1 reducer: content subdomains
 * like "realestate.usnews.com" are meaningfully separate from "usnews.com"
 * and must stay broken out, so we only collapse this known-presentation set.
 */
const PRESENTATION_SUBDOMAIN_LABELS = new Set(["m", "www", "mobile", "amp"]);

/**
 * Collapse presentation subdomains for the "top cited domains" roll-up, so the
 * mobile/AMP/www variant of a host is counted as the same domain as its
 * canonical form (m.yelp.com → yelp.com). Strips presentation labels off the
 * front repeatedly (mobile.m.foo.com → foo.com) but stops once two labels
 * remain so the registrable domain is never reduced to a bare TLD. Any
 * non-presentation leading label (realestate.usnews.com) is left untouched.
 * Returns the input lowercased/trimmed when there's nothing to strip.
 */
export function rollupDisplayDomain(domain: string): string {
  let labels = domain.trim().toLowerCase().split(".");
  while (
    labels.length > 2 &&
    PRESENTATION_SUBDOMAIN_LABELS.has(labels[0])
  ) {
    labels = labels.slice(1);
  }
  return labels.join(".");
}

/**
 * Match if domains agree exactly after normalization, OR if their base names
 * share a substring of `minOverlap` chars or more. Tuned to catch
 * "timharvey.com" ↔ "timharveyrealestate.com" without firing on:
 *   - Generic real-estate tokens (GENERIC_REALESTATE_TOKENS) — would otherwise
 *     match unrelated agent sites that both happen to contain "realtors".
 *   - Known portals/brokerages from the citations registry — the prospect is
 *     always an individual agent, so substring matches against realtor.com,
 *     compass.com, etc. are guaranteed false positives. Those only match on
 *     exact equality (handled above).
 */
export function domainsMatch(
  a: string | null,
  b: string | null,
  minOverlap = 6,
): boolean {
  const na = normalizeDomain(a);
  const nb = normalizeDomain(b);
  if (!na || !nb) return false;
  if (na === nb) return true;

  // Either side being a known portal/brokerage disqualifies a fuzzy match —
  // the exact-equality check above already handled the legitimate case.
  if (isKnownPortalOrBrokerage(na) || isKnownPortalOrBrokerage(nb)) {
    return false;
  }

  const ba = baseName(na);
  const bb = baseName(nb);
  if (!ba || !bb) return false;

  const [shorter, longer] = ba.length <= bb.length ? [ba, bb] : [bb, ba];
  if (shorter.length < minOverlap) return false;

  // The shorter base name is the would-be matching substring. If it's a
  // generic real-estate token, refuse — the overlap isn't real signal.
  if (GENERIC_REALESTATE_TOKENS.has(shorter)) return false;

  return longer.includes(shorter);
}

/** Strip punctuation, collapse whitespace, lowercase. "O'Brien, Tim" → "obrien tim" */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match if prospect name appears in listing name (normalized), in either order.
 * Requires prospect to have 2+ word tokens of 2+ chars each — so "Tim" alone
 * can't fire, but "Tim Harvey" matches "Tim Harvey Real Estate" or "Harvey, Tim".
 */
export function namesMatch(
  prospect: string | null | undefined,
  listing: string | null | undefined,
): boolean {
  const p = normalizeName(prospect);
  const l = normalizeName(listing);
  if (!p || !l) return false;
  const tokens = p.split(" ").filter((t) => t.length >= 2);
  if (tokens.length < 2) return false;

  // Forward: prospect name appears contiguously in listing
  if (l.includes(p)) return true;

  // Reverse / out-of-order: every prospect token appears in listing
  const listingTokens = new Set(l.split(" "));
  return tokens.every((t) => listingTokens.has(t));
}
