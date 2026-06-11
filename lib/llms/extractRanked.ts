import { SCHEMA_INSTRUCTION, safeParseAgents } from "./prompt";
import type { RankedAgent } from "../types";

/**
 * Structure a search-grounded model's prose answer into a ranked agent list
 * via a cheap, tool-less extraction call.
 *
 * Why this exists: OpenAI and Gemini only return citations / grounding metadata
 * when they answer in prose — forcing pure JSON output zeroes out both the
 * inline url_citation annotations and the consulted-source list. So those
 * fetchers now ask for prose (which we keep as raw_response for citation
 * extraction) and call this to recover the { rank, name, domain, url } list.
 * Prose can't be parsed reliably with a regex across our query phrasings (some
 * queries yield a numbered list, others a single sentence), so we hand it to a
 * small model in JSON mode. This pass only recovers the ranking; citations
 * still come from the original grounded response.
 *
 * Resilient by design: any failure (missing key, network, non-200, malformed
 * JSON, empty prose) returns an empty list so the caller degrades to
 * no_results rather than throwing away a valid grounded answer + its citations.
 */
export async function extractRankedFromProse(
  prose: string,
): Promise<RankedAgent[]> {
  const text = prose?.trim();
  if (!text) return [];

  const key = process.env.OPENAI_API_KEY;
  if (!key) return [];

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "user",
            content: `Extract the ranked agents from the ANSWER below, preserving the exact order they appear. Do not add, drop, reorder, or invent anyone — only structure what is already there.\n\n${SCHEMA_INSTRUCTION}\n\nANSWER:\n${text}`,
          },
        ],
      }),
    });

    if (!resp.ok) return [];

    const data = (await resp.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    return safeParseAgents(content)?.agents ?? [];
  } catch {
    return [];
  }
}
