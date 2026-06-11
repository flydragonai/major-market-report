import { PROSE_INSTRUCTION, buildSystemInstruction } from "./prompt";
import { extractRankedFromProse } from "./extractRanked";
import type { RawFetchResult } from "./index";

export async function fetchOpenAI(query: string): Promise<RawFetchResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");

  const resp = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      // We ask for PROSE, not JSON: gpt-4o only emits inline url_citation
      // annotations (and only populates web_search_call.action.sources) when it
      // writes a grounded prose answer — forcing JSON output zeroes both out.
      // `web_search` is the GA grounding tool; `include` asks for the broader
      // consulted-source set. extractCitations reads both off `raw`; the ranked
      // list is recovered from the prose by extractRankedFromProse.
      tools: [{ type: "web_search" }],
      include: ["web_search_call.action.sources"],
      instructions: buildSystemInstruction(),
      input: [
        {
          role: "user",
          content: `${query}\n\n${PROSE_INSTRUCTION}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenAI ${resp.status}: ${text.slice(0, 300)}`);
  }

  const raw = (await resp.json()) as unknown;
  const text = extractText(raw);
  const ranked = await extractRankedFromProse(text);
  return { raw, ranked };
}

function extractText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const r = raw as Record<string, unknown>;
  if (typeof r.output_text === "string") return r.output_text;
  const output = r.output;
  if (Array.isArray(output)) {
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as Record<string, unknown>).content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (!c || typeof c !== "object") continue;
        const t = (c as Record<string, unknown>).text;
        if (typeof t === "string") parts.push(t);
      }
    }
    return parts.join("\n");
  }
  return "";
}
