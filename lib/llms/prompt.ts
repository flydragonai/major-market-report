export function buildQuery(
  market: string,
  specialty: string | null = null,
): string {
  const suffix = specialty?.trim() ? ` for ${specialty.trim()}` : "";
  return `Who are the best individual real estate agents (real people, not teams or brokerages) in ${market}${suffix}?`;
}

/**
 * System-level context shared by every LLM call. Stating today's date anchors
 * the model's notion of "current" so it prefers up-to-date rankings over stale
 * "best agents 2020"-style listicles.
 *
 * Computed per call (NOT a module constant) so a long-running server process
 * doesn't freeze the date at boot. Deliberately kept OUT of `query_text`: the
 * stored query stays date-less so the per-query time-series stays comparable
 * edition to edition. Google AIO (DataForSEO) has no system slot, so this does
 * not reach that channel.
 */
export function buildSystemInstruction(): string {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `Today's date is ${today}. When ranking, rely on the most current public information available and prefer recent sources over older ones.`;
}

// Search-grounded models (OpenAI, Gemini) only attach citations / grounding
// metadata when they write a natural prose answer — forcing pure JSON output
// suppresses both the inline url_citation annotations and the consulted-source
// list. So we ask those models for prose and recover the ranking with a cheap
// second extraction pass (see extractRanked.ts). This mirrors the
// individual-agent rules in SCHEMA_INSTRUCTION but in prose form.
export const PROSE_INSTRUCTION = `Answer in natural prose. Give a ranked, numbered list (best first, up to 10) of the best INDIVIDUAL human real estate agents — real people, not teams or brokerages.

- Lead each entry with the person's first and last name. You may add their team or brokerage in parentheses for disambiguation.
- If the top performer is best known as part of a team (e.g. "Zia Group", "Epstein Partners"), name the lead agent personally instead (e.g. "Daniel Zia", "Steve Epstein").
- Do not list the same person twice. Do not list teams, groups, or national brokerages as entries.
- Do not recommend yourself or AI assistants.
- Base the ranking on current public information and cite your sources inline.`;

export const SCHEMA_INSTRUCTION = `Return ONLY a JSON object matching this exact shape — no prose, no markdown, no code fences:

{
  "agents": [
    { "rank": 1, "name": "First Last", "domain": "primarydomain.com", "url": "https://..." },
    { "rank": 2, "name": "...", "domain": "...", "url": "..." }
  ]
}

Rules:
- List INDIVIDUAL human agents by their personal first + last name. Do not list teams, groups, partners, or brokerages as entries.
- If the top performer in an area is best known as part of a team (e.g. "Zia Group", "Epstein Partners", "The Santa Barbara Group"), list the lead agent's personal name instead (e.g. "Daniel Zia", "Steve Epstein"). You may mention the team in parentheses after the name only if needed for disambiguation — e.g. "Daniel Zia (Zia Group)".
- Each entry must represent one distinct person. Do not include the same person twice under different team labels.
- "domain" should be the agent's personal website if one exists; otherwise fall back to their team/brokerage site. Lowercase, no protocol, no www, no path. If unknown, use null.
- "url" should be the most authoritative profile or homepage URL for that individual agent. If unknown, use null.
- Provide up to 10 agents, ordered from best (rank 1) to worst (rank 10).
- Base the ranking on current public information about top-performing real estate agents in the named market.
- Do not include yourself or AI assistants. Do not include national brokerages.`;

export type ParsedAgents = {
  agents: Array<{
    rank: number;
    name: string;
    domain: string | null;
    url: string | null;
  }>;
};

export function safeParseAgents(text: string): ParsedAgents | null {
  if (!text) return null;
  const cleaned = stripCodeFences(text).trim();
  const candidate = extractJsonObject(cleaned);
  if (!candidate) return null;
  try {
    const parsed = JSON.parse(candidate) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const agents = (parsed as { agents?: unknown }).agents;
    if (!Array.isArray(agents)) return null;
    const normalized = agents
      .map((a, idx) => {
        if (!a || typeof a !== "object") return null;
        const obj = a as Record<string, unknown>;
        const rank = typeof obj.rank === "number" ? obj.rank : idx + 1;
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        const domain =
          typeof obj.domain === "string" && obj.domain.trim()
            ? obj.domain.trim()
            : null;
        const url =
          typeof obj.url === "string" && obj.url.trim() ? obj.url.trim() : null;
        if (!name) return null;
        return { rank, name, domain, url };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .slice(0, 10);
    return { agents: normalized };
  } catch {
    return null;
  }
}

function stripCodeFences(s: string): string {
  return s.replace(/```(?:json)?/gi, "").replace(/```/g, "");
}

function extractJsonObject(s: string): string | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
