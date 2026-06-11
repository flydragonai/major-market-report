/**
 * Classify a citation into one of the source categories used by the FlyDragon
 * Real Estate AI Citation Index report. Categories match page 7 of the 2026
 * edition: portals, agent-owned websites, GBP/reviews, brokerage websites,
 * local media, YouTube — plus a few we track separately (social, wikipedia,
 * other review aggregators).
 *
 * `brand` is a stable lowercase slug for known entities (e.g. "zillow",
 * "compass") so report aggregations can group by canonical brand even when a
 * brokerage uses multiple domains (bhhs.com, berkshirehathawayhs.com,
 * bhhscalifornia.com all collapse to "bhhs").
 *
 * Default is `agent_site` for unknown domains — the index's premise is that
 * an unrecognised real-estate-ish domain is most likely an individual
 * agent/team site, which is the most useful default for the
 * "agent-owned vs portal" headline metric. Update the registry as new known
 * entities surface.
 */

export type CitationKind =
  | "portal"
  | "brokerage"
  | "agent_site"
  | "gbp"
  | "knowledge_graph"
  | "video"
  | "review"
  | "directory"
  | "pr"
  | "listicle"
  | "social"
  | "local_media"
  | "industry_news"
  | "wiki"
  | "government"
  | "jobs"
  | "other"
  | "unclassified";

/** Subset displayed in the operator's "save this domain" selector. We
 *  hide `unclassified` from the picker because it's not a destination
 *  — it's the source the operator is moving away from. */
export const SELECTABLE_KINDS: CitationKind[] = [
  "agent_site",
  "directory",
  "listicle",
  "portal",
  "brokerage",
  "review",
  "pr",
  "social",
  "local_media",
  "industry_news",
  "wiki",
  "video",
  "gbp",
  "knowledge_graph",
  "government",
  "jobs",
  "other",
];

export type CitationClassification = {
  kind: CitationKind;
  brand: string | null;
};

/**
 * Shape stored on `client_model_results.citations` (jsonb array). Produced by
 * the score app's extractor + classifier; consumed here for aggregation +
 * display. Keep in sync with live-ai-visibility-score/lib/llms/citations.ts.
 */
export type Citation = {
  title: string | null;
  url: string;
  domain: string | null;
  kind: CitationKind;
  brand: string | null;
};

/** Human label for a citation kind — used in chart legends + tables. */
export const CITATION_KIND_LABEL: Record<CitationKind, string> = {
  portal: "Portal",
  brokerage: "Brokerage",
  agent_site: "Agent-owned",
  gbp: "Google Business Profile",
  knowledge_graph: "Google Knowledge Graph",
  video: "Video",
  review: "Review",
  directory: "Directory / aggregator",
  pr: "PR / press",
  listicle: "Listicle / guest post",
  social: "Social",
  local_media: "Local media",
  industry_news: "Industry news",
  wiki: "Wikipedia",
  government: "Government / housing authority",
  jobs: "Jobs / careers",
  other: "Other",
  unclassified: "Unclassified",
};

const UNKNOWN: CitationClassification = { kind: "other", brand: null };

/**
 * Look up `domain` in a registry keyed by registrable domains, rolling up
 * subdomains to their parent. Tries the full domain first, then strips leading
 * labels one at a time (m.yelp.com → yelp.com, biz.yelp.com → yelp.com) so
 * mobile / regional / department subdomains collapse to the same brand instead
 * of falling through to the default bucket. Stops at two labels so a bare TLD
 * (e.g. ".com") can never match.
 */
function lookupWithRollup(
  domain: string,
  registry: Record<string, string>,
): string | undefined {
  const labels = domain.split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const hit = registry[labels.slice(i).join(".")];
    if (hit) return hit;
  }
  return undefined;
}

/**
 * Major real-estate portals (page 7 "Portals" bucket). Brand keys are kept
 * stable so the report can group by brand across editions.
 */
const PORTALS: Record<string, string> = {
  "zillow.com": "zillow",
  "trulia.com": "zillow", // owned by Zillow Group; keep brand consistent
  "realtor.com": "realtor",
  "homes.com": "homes_com",
  "redfin.com": "redfin",
  "movoto.com": "movoto",
  "estately.com": "estately",
  "homefinder.com": "homefinder",
  "rocket.com": "rocket",
  "rockethomes.com": "rocket",
  "auction.com": "auction_com",
  "ziprealty.com": "ziprealty",
  "har.com": "har",
  "point2homes.com": "point2",
  "loopnet.com": "loopnet",
  "crexi.com": "crexi",
};

/**
 * Known major brokerages (page 6). Brand collapses sibling domains.
 */
const BROKERAGES: Record<string, string> = {
  "coldwellbanker.com": "coldwell_banker",
  "coldwellbankerhomes.com": "coldwell_banker",
  "cbhomes.com": "coldwell_banker",
  "compass.com": "compass",
  "remax.com": "remax",
  "remax-results.com": "remax",
  "kw.com": "keller_williams",
  "kellerwilliams.com": "keller_williams",
  "kwluxury.com": "keller_williams",
  "exprealty.com": "exp_realty",
  "expcommercial.com": "exp_realty",
  "sothebysrealty.com": "sothebys",
  "sir.com": "sothebys",
  "bhhs.com": "bhhs",
  "berkshirehathawayhs.com": "bhhs",
  "bhhscalifornia.com": "bhhs",
  "century21.com": "century21",
  "c21.com": "century21",
  "era.com": "era",
  "corcoran.com": "corcoran",
  "douglaselliman.com": "douglas_elliman",
  "elliman.com": "douglas_elliman",
  "realbroker.com": "real_broker",
  "onereal.com": "real_broker",
  "joinreal.com": "real_broker",
  "windermere.com": "windermere",
  "longandfoster.com": "long_and_foster",
  "weichert.com": "weichert",
  "howardhanna.com": "howard_hanna",
  "betterhomesandgardens.com": "bhgre",
  "bhgre.com": "bhgre",
  "thecorcorangroup.com": "corcoran",
  "engelvoelkers.com": "engel_volkers",
};

/**
 * Google Business Profile / Maps / Reviews. We also accept Vertex AI grounding
 * redirect domains here — they often resolve to GBP results — but downstream
 * analytics should treat them carefully because the actual destination is
 * hidden inside the redirect.
 */
const GBP_DOMAIN_SUFFIXES = [
  "maps.google.com",
  "business.google.com",
  "g.co",
  "goo.gl/maps",
];

/**
 * Video platforms.
 */
const VIDEO_DOMAINS: Record<string, string> = {
  "youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "vimeo.com": "vimeo",
  "tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
};

/**
 * Social.
 */
const SOCIAL_DOMAINS: Record<string, string> = {
  "facebook.com": "facebook",
  "m.facebook.com": "facebook",
  "fb.com": "facebook",
  "fb.watch": "facebook",
  "instagram.com": "instagram",
  "x.com": "x",
  "twitter.com": "x",
  "linkedin.com": "linkedin",
  "pinterest.com": "pinterest",
  "reddit.com": "reddit",
  "threads.net": "threads",
  "nextdoor.com": "nextdoor",
};

/**
 * Independent review aggregators (i.e. not GBP — GBP is its own bucket per
 * the report).
 */
const REVIEW_DOMAINS: Record<string, string> = {
  "yelp.com": "yelp",
  "trustpilot.com": "trustpilot",
  "bbb.org": "bbb",
  "angi.com": "angi",
  "thumbtack.com": "thumbtack",
  "ratemyagent.com": "ratemyagent",
  "rate-my-agent.com": "ratemyagent",
  "rankmyagent.com": "rankmyagent",
};

/**
 * Agent-matching marketplaces + editorial "best agents in {city}" ranking
 * sites. Distinct from REVIEW_DOMAINS (consumer review platforms) and from
 * real agent/team sites — these are third-party directories that rank or
 * match agents. Previously defaulted to agent_site, badly inflating the
 * "agent-owned" share. Subdomain keys (realestate.usnews.com) are exact so a
 * site's non-real-estate sections don't get pulled in.
 */
const DIRECTORY_DOMAINS: Record<string, string> = {
  "effectiveagents.com": "effectiveagents",
  "fastexpert.com": "fastexpert",
  "upnest.com": "upnest",
  "homelight.com": "homelight",
  "idealagent.com": "idealagent",
  "listwithclever.com": "clever",
  "agentpronto.com": "agentpronto",
  "referralexchange.com": "referralexchange",
  "homeguide.com": "homeguide",
  "realestateagents.com": "realestateagents",
  "expertise.com": "expertise",
  "realtrends.com": "realtrends",
  "realtyhop.com": "realtyhop",
  "threebestrated.com": "threebestrated",
  "realestate.usnews.com": "usnews",
  "contractorlistshq.com": "contractorlistshq",
  "toptrendingagent.com": "toptrendingagent",
  "yellowpages.com": "yellowpages",
  "top10reagents.com": "top10reagents",
  "top10lists.us": "top10lists",
  "bestrealestateagentnear.me": "bestreagentnearme",
  "realtorson.com": "realtorson",
  "agentfixup.com": "agentfixup",
  "trueparity.com": "trueparity",
  "iondocs.com": "iondocs",
  "tabtablabs.com": "tabtablabs",
  "experience.com": "experience",
  "goflydragon.com": "goflydragon",
  "top100realestateagents.com": "top100reagents",
  "socialrealtr.com": "socialrealtr",
  "accio.com": "accio",
  "homeia.com": "homeia",
  "biggerpockets.com": "biggerpockets", // /{st}/{city}/agents directory listings
};

/**
 * Press-release wires + syndication endpoints. These carry agent-placed PR
 * (the agent paid to publish), not editorial coverage — tracked separately
 * from local_media so the report can distinguish earned vs placed press.
 */
const PR_DOMAINS: Record<string, string> = {
  "newswire.com": "newswire",
  "accessnewswire.com": "accesswire",
  "accesswire.com": "accesswire",
  "prnewswire.com": "prnewswire",
  "businesswire.com": "businesswire",
  "einpresswire.com": "einpresswire",
  "globenewswire.com": "globenewswire",
  "prweb.com": "prweb",
  "prlog.org": "prlog",
  "openpr.com": "openpr",
  "24-7pressrelease.com": "pr247",
  "financialcontent.com": "financialcontent",
  "finance.yahoo.com": "yahoo_finance",
  "pressrelease.com": "pressrelease",
  "digitaljournal.com": "digitaljournal",
};

/**
 * Legal directories / firm aggregators — surface on probate-specialty
 * queries. Not real estate sources, so they land in `other` rather than the
 * agent_site default.
 */
const LEGAL_DOMAINS: Record<string, string> = {
  "justia.com": "justia",
  "superlawyers.com": "superlawyers",
  "natlawreview.com": "natlawreview",
  "avvo.com": "avvo",
  "nolo.com": "nolo",
  "findlaw.com": "findlaw",
  "lawyers.com": "lawyers_com",
  "martindale.com": "martindale",
  "abloomquist.com": "bloomquist_law",
  "hardiealcozer.com": "hardie_alcozer",
};

/**
 * Local / city magazines + regional publications that run editorial "top
 * agents" features. Distinct from the generic LOCAL_MEDIA_PATTERNS below —
 * these named titles wouldn't match the suffix patterns. Subdomain keys roll
 * up (prestonhollow.advocatemag.com → advocatemag.com).
 */
const LOCAL_MEDIA_DOMAINS: Record<string, string> = {
  "washingtonian.com": "washingtonian",
  "advocatemag.com": "advocatemag",
  "planomagazine.com": "plano_magazine",
  // Earned editorial "top agents" features from real publications — distinct
  // from PR (paid wire placements) and Directory (SEO/aggregator ranking sites).
  "hollywoodreporter.com": "hollywood_reporter",
  "5280.com": "5280",
  "dmagazine.com": "d_magazine",
  "bostonmagazine.com": "boston_magazine",
  "texasmonthly.com": "texas_monthly",
  "newsweek.com": "newsweek",
  "mainlinetoday.com": "main_line_today",
  "palmspringslife.com": "palm_springs_life",
  "localprofile.com": "local_profile",
};

/**
 * Real-estate trade press — editorial publications whose entire reason
 * for existing is to cover the industry. Carries earned-media weight that
 * `pr` (wire placements) and `listicle` (paid "Top 10 Agents" posts)
 * don't, and a strategically different audience from `local_media` (the
 * general regional press that occasionally runs an agent profile).
 *
 * If a client appears in The Real Deal vs Patch.com, those are very
 * different wins — the donut needs to split them.
 */
const INDUSTRY_NEWS_DOMAINS: Record<string, string> = {
  // National / cross-market trade press
  "inman.com": "inman",
  "housingwire.com": "housingwire",
  "rismedia.com": "rismedia",
  "therealdeal.com": "the_real_deal",
  "propmodo.com": "propmodo",
  "realestatenews.com": "realestatenews",
  "realtormag.realtor.org": "realtor_magazine",
  "magazine.realtor": "realtor_magazine",
  "nar.realtor": "nar",
  "bisnow.com": "bisnow", // CRE-leaning but heavily real-estate editorial
  "globest.com": "globest", // CRE trade
  "connect.media": "connect_cre",
  "rebusinessonline.com": "rebusinessonline",
  "realestateweekly.com": "realestateweekly",
  // realtrends.com is in DIRECTORY_DOMAINS as the rankings product —
  // their editorial sister site is intentionally not split out here
  // unless we see it as a distinct domain in real data.
};

/**
 * Agent Publishing local-trade-press franchise — Boston Agent Magazine,
 * South Florida Agent Magazine, Chicago Agent Magazine, etc. Same
 * publisher, same editorial format, one regex covers all current and
 * future cities (atlanta-, houston-, dallas-, phillyagentmagazine.com,
 * …). These are trade publications written for and about agents, not
 * general-audience local news — they belong in industry_news, not
 * local_media.
 */
const INDUSTRY_NEWS_PATTERNS: RegExp[] = [
  /(^|\.)[a-z]+agentmagazine\.com$/, // Agent Publishing city-magazine franchise
  /(^|\.)agentadvice\.com$/,
];

/**
 * Forums / communities / misc non-source domains that would otherwise default
 * to agent_site. Real estate Q&A and community sites aren't agent-owned.
 */
const OTHER_DOMAINS: Record<string, string> = {
  "quora.com": "quora",
  "libertyhomeguard.com": "liberty_home_guard", // home-warranty co content marketing
  "dmarealtors.com": "dmar", // Realtor association awards page
};

const WIKI_DOMAINS: Record<string, string> = {
  "wikipedia.org": "wikipedia",
  "en.wikipedia.org": "wikipedia",
};

/**
 * Heuristic patterns for local media / news. Not exhaustive — additions
 * welcome as they show up in real data. Order matters: more specific first.
 */
const LOCAL_MEDIA_PATTERNS: RegExp[] = [
  /(^|\.)patch\.com$/,
  /(^|\.)axios\.com$/,
  /(^|\.)bizjournals\.com$/,
  /\btribune\.com$/,
  /\bherald\.com$/,
  /\bgazette\.com$/,
  /\bchronicle\.com$/,
  /\btimes\.com$/,
  /\bjournal\.com$/,
  /\bpost\.com$/,
  /\bnewspaper\.com$/,
  /\bnews\.com$/,
  /\bcurbed\.com$/,
  /\bcitybiz\.co$/,
  /\bdailyherald\.com$/,
  /\bsun-times\.com$/,
];

/**
 * Vertex AI grounding redirect — Gemini emits these instead of the actual
 * source URL. We can't classify without resolving the redirect, so they land
 * in `other` with brand "gemini_redirect" so they're trivially filterable.
 */
const GEMINI_REDIRECT_PATTERNS: RegExp[] = [
  /vertexaisearch\.cloud\.google\.com/,
];

export function classifyCitation(c: {
  url: string;
  domain: string | null;
  title: string | null;
}): CitationClassification {
  const domain = (c.domain ?? "").toLowerCase();
  if (!domain) return UNKNOWN;

  // 0. Gemini redirects — can't classify without resolving
  for (const p of GEMINI_REDIRECT_PATTERNS) {
    if (p.test(domain)) {
      return { kind: "other", brand: "gemini_redirect" };
    }
  }

  // 0b. Google AI Overview "searchviewer" links. The svid param encodes a
  //     Google Knowledge Graph entity MID (/g/… or /m/…) and the link renders
  //     the agent/brokerage's Google knowledge card — verified: 100% of these
  //     carry a KG MID. So they're Google's Knowledge Graph surface, NOT a
  //     publisher citation and NOT the agent's own site (where they used to
  //     fall through, ~25% of all citations badly skewing "agent-owned").
  if (
    (domain === "google.com" || domain.endsWith(".google.com")) &&
    /\/searchviewer\//i.test(c.url)
  ) {
    return { kind: "knowledge_graph", brand: "google_kg" };
  }

  // 1. Google Business Profile / Maps
  for (const suffix of GBP_DOMAIN_SUFFIXES) {
    if (domain === suffix || domain.endsWith(`.${suffix}`)) {
      return { kind: "gbp", brand: "gbp" };
    }
  }
  // google.com/maps/... — domain is google.com but path matters
  if (
    (domain === "google.com" || domain.endsWith(".google.com")) &&
    /\/maps\//i.test(c.url)
  ) {
    return { kind: "gbp", brand: "gbp" };
  }

  // 2. Video
  const video = lookupWithRollup(domain, VIDEO_DOMAINS);
  if (video) {
    return { kind: "video", brand: video };
  }

  // 3. Social
  const social = lookupWithRollup(domain, SOCIAL_DOMAINS);
  if (social) {
    return { kind: "social", brand: social };
  }

  // 4. Reviews (independent — not GBP)
  const review = lookupWithRollup(domain, REVIEW_DOMAINS);
  if (review) {
    return { kind: "review", brand: review };
  }

  // 5. Wikipedia
  for (const wd of Object.keys(WIKI_DOMAINS)) {
    if (domain === wd || domain.endsWith(`.${wd}`)) {
      return { kind: "wiki", brand: WIKI_DOMAINS[wd] };
    }
  }

  // 5a. Agent-matching / ranking directories
  const directory = lookupWithRollup(domain, DIRECTORY_DOMAINS);
  if (directory) {
    return { kind: "directory", brand: directory };
  }

  // 5b. PR wires / syndication — known wire domains, OR any /press-release/
  //     URL path. Syndicated PR shows up on local-news domains too (e.g.
  //     desmoinesregister.com/press-release/story/...), so the path is a
  //     stronger signal than the host and is checked before local_media.
  const pr = lookupWithRollup(domain, PR_DOMAINS);
  if (pr) {
    return { kind: "pr", brand: pr };
  }
  if (/\/press[-_]?releases?\//i.test(c.url)) {
    return { kind: "pr", brand: null };
  }

  // 5c. Legal directories (probate-query noise) → other, not agent_site
  const legal = lookupWithRollup(domain, LEGAL_DOMAINS);
  if (legal) {
    return { kind: "other", brand: legal };
  }

  // 6. Brokerages (corporate sites — local franchisee sites for KW etc. are
  //    typically separate domains and fall through to agent_site, which is
  //    arguably correct for the report's "agent-owned" bucket)
  const brokerage = lookupWithRollup(domain, BROKERAGES);
  if (brokerage) {
    return { kind: "brokerage", brand: brokerage };
  }

  // 7. Portals
  const portal = lookupWithRollup(domain, PORTALS);
  if (portal) {
    return { kind: "portal", brand: portal };
  }

  // 7a. Industry news — real-estate trade press. Checked BEFORE
  //     local_media so the Agent Publishing franchise
  //     (bostonagentmagazine.com etc.) doesn't get pulled into the
  //     local_media regex via its `*magazine.com` suffix, and so The
  //     Real Deal lands as trade press rather than "local" in any
  //     market.
  const industry = lookupWithRollup(domain, INDUSTRY_NEWS_DOMAINS);
  if (industry) {
    return { kind: "industry_news", brand: industry };
  }
  for (const pattern of INDUSTRY_NEWS_PATTERNS) {
    if (pattern.test(domain)) {
      return { kind: "industry_news", brand: null };
    }
  }

  // 8. Local media — named publications first, then suffix patterns.
  const localMedia = lookupWithRollup(domain, LOCAL_MEDIA_DOMAINS);
  if (localMedia) {
    return { kind: "local_media", brand: localMedia };
  }
  for (const pattern of LOCAL_MEDIA_PATTERNS) {
    if (pattern.test(domain)) {
      return { kind: "local_media", brand: null };
    }
  }

  // 8a. Known forums / communities / misc → other (not agent-owned)
  const other = lookupWithRollup(domain, OTHER_DOMAINS);
  if (other) {
    return { kind: "other", brand: other };
  }

  // 8b. Government — pattern-matched so we don't have to enumerate every
  //     .gov housing program and city housing authority by hand. Covers
  //     boston.gov / miami.gov / floridahousing.org / .gov.uk etc.
  if (/\.gov(\.|$)|housing\.org$|housingauthority\.|hometownheroes/i.test(domain)) {
    return { kind: "government", brand: null };
  }

  // 8c. Jobs boards — explicit set, small and stable.
  if (
    /^(indeed|ziprecruiter|glassdoor|monster|simplyhired|linkedin)\.com$/.test(
      domain,
    )
  ) {
    return { kind: "jobs", brand: null };
  }

  // 9. Default — UNCLASSIFIED, not agent_site. The previous default
  //    "assume any unknown real-estate-ish domain is an agent's personal
  //    site" inflated the Agent-owned bucket with directories, listicles,
  //    PR pages, gov sites, etc. Now: the operator triages unknowns via
  //    the in-app picker, which persists to mmr_domain_overrides; the
  //    override layer in lib/citations/overrides.ts reapplies overrides
  //    at read time.
  return { kind: "unclassified", brand: null };
}

/**
 * True if `domain` is a known portal (Zillow, Realtor.com, etc.) or known
 * national brokerage (Compass, KW, etc.) — the registries above. Used by
 * lib/domain.ts to prevent substring false-matches: our prospect is an
 * individual agent, so a substring overlap between the prospect's site
 * and a portal/brokerage domain (e.g. "shawnarealtors" ↔ "realtor.com")
 * should NOT count as a match. Only exact equality should.
 */
export function isKnownPortalOrBrokerage(
  domain: string | null | undefined,
): boolean {
  if (!domain) return false;
  const d = domain.toLowerCase().replace(/^www\./, "");
  return d in PORTALS || d in BROKERAGES;
}
