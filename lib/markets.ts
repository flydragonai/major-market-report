/**
 * The Major Market Report watchlist — the markets we treat as
 * "national-scope brand-name" for the cross-market leaderboard.
 *
 * Tier 1 = transaction-volume + brand-recognition mix. Six of these have
 * active FlyDragon clients running scoring already, which means the
 * cross-market leaderboard inherits their data without us scheduling
 * separate market-only runs. The other nine become real data once a
 * client in that market exists OR once we wire up market-only scoring
 * (deferred — see README).
 *
 * Matched against client_results.town_name + state, case-insensitive,
 * trimmed. Any client_result whose (town, state) matches a market here
 * contributes ranked-list rows to that market's bucket.
 */
export type Market = {
  /** URL-safe identifier — drives the pill query param + ordering. */
  slug: string;
  /** Display label on the pill + headers. */
  label: string;
  /** Match key — lowercase town. */
  town: string;
  /** Match key — uppercase 2-letter state code (or null for non-US). */
  state: string;
};

export const MARKETS: Market[] = [
  { slug: "manhattan-ny",   label: "Manhattan, NY",     town: "manhattan",     state: "NY" },
  { slug: "los-angeles-ca", label: "Los Angeles, CA",   town: "los angeles",   state: "CA" },
  { slug: "chicago-il",     label: "Chicago, IL",       town: "chicago",       state: "IL" },
  { slug: "houston-tx",     label: "Houston, TX",       town: "houston",       state: "TX" },
  { slug: "dallas-tx",      label: "Dallas, TX",        town: "dallas",        state: "TX" },
  { slug: "austin-tx",      label: "Austin, TX",        town: "austin",        state: "TX" },
  { slug: "phoenix-az",     label: "Phoenix, AZ",       town: "phoenix",       state: "AZ" },
  { slug: "miami-fl",       label: "Miami, FL",         town: "miami",         state: "FL" },
  { slug: "atlanta-ga",     label: "Atlanta, GA",       town: "atlanta",       state: "GA" },
  { slug: "seattle-wa",     label: "Seattle, WA",       town: "seattle",       state: "WA" },
  { slug: "denver-co",      label: "Denver, CO",        town: "denver",        state: "CO" },
  { slug: "boston-ma",      label: "Boston, MA",        town: "boston",        state: "MA" },
  { slug: "washington-dc",  label: "Washington, DC",    town: "washington dc", state: "DC" },
  { slug: "san-francisco-ca", label: "San Francisco, CA", town: "san francisco", state: "CA" },
  { slug: "nashville-tn",   label: "Nashville, TN",     town: "nashville",     state: "TN" },
];

const MARKET_BY_KEY = new Map<string, Market>(
  MARKETS.flatMap((m) => {
    // Also index secondary forms ("washington" / "washington d.c.") so
    // case + punctuation drift in client_results.town_name doesn't drop
    // legitimate rows.
    const keys = [`${m.town}|${m.state}`];
    if (m.town === "washington dc") {
      keys.push(`washington|${m.state}`, `washington d.c.|${m.state}`);
    }
    return keys.map((k) => [k, m] as [string, Market]);
  }),
);

/** Resolve a (town, state) pair to its Market entry, if it matches one of
 *  the tracked markets. Returns null for anything off the watchlist. */
export function marketFor(
  town: string | null | undefined,
  state: string | null | undefined,
): Market | null {
  if (!town || !state) return null;
  const key = `${town.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
  return MARKET_BY_KEY.get(key) ?? null;
}

export function marketBySlug(slug: string): Market | null {
  return MARKETS.find((m) => m.slug === slug) ?? null;
}
