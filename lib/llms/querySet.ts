/** Inlined from client-reporting/lib/targets.ts so MMR's LLM dir is self-contained. */
function normalizeSpecialty(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim().toLowerCase();
  return t === "" ? null : t;
}

/**
 * The tracked query set. We no longer ask a single "best agents" question per
 * targeting — instead each targeting fans out across an intent skeleton so a
 * client's AI visibility reflects how real consumers actually phrase the ask.
 *
 * TWO LAYERS (tune everything here, one place):
 *
 *   Layer 1 — VARIANTS: the intent skeleton (best / top 10 / #1 / who is best /
 *   recommend / most experienced). Each renders a "subject" noun phrase + the
 *   market into a natural query.
 *
 *   Layer 2 — SPECIALTY_RENDER: a per-specialty phrasing dictionary keyed on
 *   the prod specialization slugs. It does NOT store separate query lists — it
 *   only describes how a slug injects into the Layer-1 skeleton:
 *     - adjective : "{value} {base}"     e.g. probate    → "probate agent"
 *     - noun      : "{base} for {value}" e.g. golf       → "agent for golf course homes"
 *     - entity    : value replaces base  e.g. property_management → "property manager"
 *
 * Which set runs is decided by the targeting's specialty (same either/or as the
 * rest of the system): specialty present → that specialty's set; otherwise the
 * CORE set. Per-client custom lists are intentionally NOT here — shared phrasings
 * keep cross-client/cross-market comparability and a clean time-series.
 *
 * IMPORTANT: SPECIALTY_RENDER keys MUST match the prod specializations CHECK
 * constraint exactly (underscored slugs: property_management, 55_plus, ...).
 */

/** A subject noun phrase in both grammatical numbers, so the "top 10" variant
 *  can pluralize without runtime guessing. */
type Subject = { singular: string; plural: string; slug: string };

type Variant = {
  id: string;
  label: string;
  /** `date` is the anchor appended to the question (e.g. "June 2026"). Threaded
   *  in rather than computed inside the render so buildQuerySet controls the
   *  source-of-truth (real current date) and queryTemplate can use the same
   *  value or a placeholder for display. */
  render: (s: Subject, market: string, date: string) => string;
};

/** "a" vs "an" for the recommend variant. */
function article(word: string): string {
  return /^[aeiou]/i.test(word.trim()) ? "an" : "a";
}

/**
 * Date anchor injected into every question — see VARIANTS below. The system
 * instruction already states today's date, but the per-query payload that
 * web_search builds doesn't see the system slot (verified empirically: GPT
 * was still appending "2023" to fan-out queries despite the system anchor).
 * Putting the date in the user turn forces it through to the query builder.
 *
 * Month + year (not a full date) because rankings don't change day-to-day and
 * a coarser anchor keeps stored query_text values stable across reruns within
 * the same month.
 */
function currentMonthYear(): string {
  return new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
}

const VARIANTS: Variant[] = [
  // Phrased as natural questions (not bare search fragments) so conversational
  // models get a real user turn. `best` asks plural to stay distinct from the
  // Date anchor goes at the end before the "?" so the grammar stays clean
  // across every variant.
  //
  // Dropped `who_best` ("Who is the best {singular}...?") — it duplicated
  // `best` ("Who are the best {plural}...?") at the LLM level. Both forms
  // got near-identical fan-out and overlapping ranked-list output, so it
  // was paying double for the same signal. Legacy who_best__* rows stay
  // in the DB as history but no new runs produce them.
  { id: "best", label: "Best", render: (s, m, d) => `Who are the best ${s.plural} in ${m}, as of ${d}?` },
  { id: "top10", label: "Top 10", render: (s, m, d) => `Who are the top 10 ${s.plural} in ${m}, as of ${d}?` },
  { id: "number_one", label: "#1", render: (s, m, d) => `Who is the #1 ${s.singular} in ${m}, as of ${d}?` },
  {
    id: "recommend",
    label: "Recommend",
    render: (s, m, d) => `Can you recommend ${article(s.singular)} ${s.singular} in ${m}, as of ${d}?`,
  },
  {
    id: "experienced",
    label: "Most experienced",
    render: (s, m, d) => `Who is the most experienced ${s.singular} in ${m}, as of ${d}?`,
  },
];

/**
 * Generic entity terms for the CORE (no-specialty) set. The first two are
 * the original generic-agent subjects. The next four extend into the
 * buyer/seller intent that the team flagged — different LLM behavior
 * surfaces when consumers ask for "buyer's agent" or "listing agent"
 * specifically vs. the bare "agent" / "realtor" framing. Slugs are
 * apostrophe-free so queryIds stay clean ("buyers-agent", not "buyer-s-agent").
 */
const CORE_BASES: Subject[] = [
  { singular: "real estate agent", plural: "real estate agents", slug: "real-estate-agent" },
  { singular: "realtor", plural: "realtors", slug: "realtor" },
  { singular: "buyer's agent", plural: "buyer's agents", slug: "buyers-agent" },
  { singular: "listing agent", plural: "listing agents", slug: "listing-agent" },
  { singular: "seller's agent", plural: "seller's agents", slug: "sellers-agent" },
  {
    singular: "agent for first-time homebuyers",
    plural: "agents for first-time homebuyers",
    slug: "agent-for-first-time-homebuyers",
  },
];

/**
 * One-off questions that don't fit the variant × subject grid — fully
 * pre-rendered prompts that run alongside the templated queries for the
 * sets listed in `sets`. Use this slot for natural-phrasing consumer
 * questions where the templated form would feel awkward (e.g. "Who
 * should I hire to sell my home" doesn't decompose into a clean
 * subject noun).
 *
 * queryId for one-offs is `oneoff__${id}` — queryTemplate has a
 * dedicated lookup branch for that prefix so admin tooltips render the
 * full question with {market} / {date} placeholders.
 */
type OneOffQuery = {
  id: string;
  label: string;
  /** Which set(s) emit this question. Use ["core"] for default-on. */
  sets: string[];
  render: (market: string, date: string) => string;
};

const ONE_OFF_QUERIES: OneOffQuery[] = [
  {
    id: "hire_to_sell",
    label: "Who to hire (to sell)",
    sets: ["core"],
    render: (m, d) =>
      `Who should I hire to sell my home in ${m}, as of ${d}?`,
  },
];

/** Entity words used to build adjective/noun specialty subjects. */
const SPECIALTY_BASES = [
  { singular: "agent", plural: "agents" },
  { singular: "realtor", plural: "realtors" },
];

type SpecialtyRender =
  | { mode: "adjective"; value: string }
  | { mode: "noun"; value: string }
  | { mode: "entity"; terms: Subject[] };

const SPECIALTY_RENDER: Record<string, SpecialtyRender> = {
  probate: { mode: "adjective", value: "probate" },
  relocation: { mode: "adjective", value: "relocation" },
  luxury: { mode: "adjective", value: "luxury" },
  golf: { mode: "noun", value: "golf course homes" },
  "55_plus": { mode: "noun", value: "55+ communities" },
  property_management: {
    mode: "entity",
    terms: [
      {
        singular: "property management company",
        plural: "property management companies",
        slug: "property-management-company",
      },
      { singular: "property manager", plural: "property managers", slug: "property-manager" },
    ],
  },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\+/g, "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function subjectsForSpecialty(render: SpecialtyRender): Subject[] {
  switch (render.mode) {
    case "adjective":
      return SPECIALTY_BASES.map((b) => ({
        singular: `${render.value} ${b.singular}`,
        plural: `${render.value} ${b.plural}`,
        slug: slugify(`${render.value} ${b.singular}`),
      }));
    case "noun":
      return SPECIALTY_BASES.map((b) => ({
        singular: `${b.singular} for ${render.value}`,
        plural: `${b.plural} for ${render.value}`,
        slug: slugify(`${b.singular}-for-${render.value}`),
      }));
    case "entity":
      return render.terms;
  }
}

export type GeneratedQuery = {
  /** Stable id used as the query dimension key — `${variant}__${subjectSlug}`.
   *  Stable across runs so per-query time-series line up edition to edition. */
  id: string;
  /** Human label for the client tab, e.g. "Best · probate agent". */
  label: string;
  /** The exact question sent to each model (SCHEMA_INSTRUCTION appended by the
   *  fetchers, as today). */
  text: string;
  /** Which set this came from: "core" or the specialty slug. */
  set: string;
};

/** True when a specialty slug has an explicit Layer-2 rendering. Unknown slugs
 *  fall back to the core set rather than silently producing nothing. */
export function isKnownSpecialty(specialty: string | null | undefined): boolean {
  const norm = normalizeSpecialty(specialty);
  return norm != null && norm in SPECIALTY_RENDER;
}

/** Every subject the query set can produce (core + all specialty renderings),
 *  flattened once at module load so queryTemplate() can resolve a slug in O(N)
 *  without recomputing on every call. */
const ALL_SUBJECTS: Subject[] = (() => {
  const out: Subject[] = [...CORE_BASES];
  for (const r of Object.values(SPECIALTY_RENDER)) {
    out.push(...subjectsForSpecialty(r));
  }
  return out;
})();

/**
 * Reconstruct the question template for a stored queryId with `{market}` left
 * as a literal placeholder. Used by cross-market aggregations (the admin
 * overview) where the actual market varies row-to-row and the concrete
 * query_text would mislead — "Who are the best realtors in {market}?" reads
 * honestly there.
 *
 * Two resolution paths:
 *   1. queryId  → variant + subject slug. Works for every row written by the
 *      current fan-out (`${variant}__${slug}`).
 *   2. queryLabel → variant + subject singular. Fallback for legacy rows
 *      written before the fan-out existed (single "Best · real estate agent"
 *      style query whose id no longer matches our slug scheme). The label
 *      shape `"${variant.label} · ${subject.singular}"` is stable.
 *
 * Returns null only when BOTH paths fail (unknown variant entirely, or label
 * lacking the " · " separator).
 */
export function queryTemplate(
  queryId: string,
  queryLabel?: string | null,
): string | null {
  // Path 0: one-off queries are pre-rendered, not variant×subject products.
  // Look them up by id directly so the admin tooltip carries the full
  // question with {market} / {date} placeholders intact.
  if (queryId.startsWith("oneoff__")) {
    const oid = queryId.slice("oneoff__".length);
    const q = ONE_OFF_QUERIES.find((x) => x.id === oid);
    if (q) return q.render("{market}", currentMonthYear());
  }
  // Path 1: parse the id.
  const sep = queryId.indexOf("__");
  if (sep !== -1) {
    const variantId = queryId.slice(0, sep);
    const slug = queryId.slice(sep + 2);
    const variant = VARIANTS.find((v) => v.id === variantId);
    const subject = variant
      ? ALL_SUBJECTS.find((s) => s.slug === slug)
      : null;
    // Use the current month/year as the date anchor in the rendered template
    // so the tooltip matches what current runs are actually asking. Historical
    // query_text in the DB carries whatever was current at run time.
    if (variant && subject) {
      return variant.render(subject, "{market}", currentMonthYear());
    }
  }

  // Path 2: parse the label. Legacy / stale rows land here.
  if (!queryLabel) return null;
  const labelSep = queryLabel.indexOf(" · ");
  if (labelSep === -1) return null;
  const variantLabel = queryLabel.slice(0, labelSep);
  const subjectSingular = queryLabel.slice(labelSep + 3);
  const variantByLabel = VARIANTS.find((v) => v.label === variantLabel);
  if (!variantByLabel) return null;
  // Prefer a registered subject (proper plural form) when the singular still
  // matches one we know. Otherwise synthesize a Subject with crude
  // pluralization — fine for "realtor"→"realtors", "real estate agent"→
  // "real estate agents", which is what legacy labels look like.
  const subjectByLabel = ALL_SUBJECTS.find(
    (s) => s.singular === subjectSingular,
  ) ?? {
    singular: subjectSingular,
    plural: `${subjectSingular}s`,
    slug: "",
  };
  return variantByLabel.render(subjectByLabel, "{market}", currentMonthYear());
}

/**
 * Build the full tracked query set for one targeting. Core set when the
 * targeting has no (or an unrecognized) specialty; the specialty's set
 * otherwise.
 */
export function buildQuerySet(
  market: string,
  specialty: string | null = null,
): GeneratedQuery[] {
  const norm = normalizeSpecialty(specialty);
  const render = norm ? SPECIALTY_RENDER[norm] : undefined;
  const set = render ? norm! : "core";
  const subjects = render ? subjectsForSpecialty(render) : CORE_BASES;

  // Resolve the date anchor ONCE per buildQuerySet call so every query in this
  // set shares the same value. Avoids the edge case where a run straddling
  // midnight on the last day of a month produces some queries in "May 2026"
  // and others in "June 2026".
  const date = currentMonthYear();
  const out: GeneratedQuery[] = [];
  for (const subject of subjects) {
    for (const v of VARIANTS) {
      out.push({
        id: `${v.id}__${subject.slug}`,
        label: `${v.label} · ${subject.singular}`,
        text: v.render(subject, market, date),
        set,
      });
    }
  }
  // Append any one-off questions that target this set. Their ids carry
  // the `oneoff__` prefix so downstream lookups (queryTemplate) can
  // route to the pre-rendered question instead of trying to parse a
  // variant × subject id.
  for (const q of ONE_OFF_QUERIES) {
    if (!q.sets.includes(set)) continue;
    out.push({
      id: `oneoff__${q.id}`,
      label: q.label,
      text: q.render(market, date),
      set,
    });
  }
  return out;
}
