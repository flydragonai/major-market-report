import { SCHEMA_INSTRUCTION, buildSystemInstruction, safeParseAgents } from "./prompt";
import type { RawFetchResult } from "./index";

export async function fetchAnthropic(query: string): Promise<RawFetchResult> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");

  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: buildSystemInstruction(),
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: `${query}\n\n${SCHEMA_INSTRUCTION}`,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${text.slice(0, 300)}`);
  }

  const raw = (await resp.json()) as unknown;
  const text = extractAnthropicText(raw);
  const parsed = safeParseAgents(text);
  return { raw, ranked: parsed?.agents ?? [] };
}

function extractAnthropicText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const content = (raw as Record<string, unknown>).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const b = block as Record<string, unknown>;
      if (b.type === "text" && typeof b.text === "string") return b.text;
      return "";
    })
    .join("\n");
}
