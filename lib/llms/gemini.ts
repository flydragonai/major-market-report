import { PROSE_INSTRUCTION, buildSystemInstruction } from "./prompt";
import { extractRankedFromProse } from "./extractRanked";
import type { RawFetchResult } from "./index";

export async function fetchGemini(query: string): Promise<RawFetchResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: buildSystemInstruction() }] },
      contents: [
        {
          role: "user",
          parts: [
            {
              // Prose, not JSON: Gemini only populates groundingMetadata
              // .groundingChunks when it writes a grounded prose answer. The
              // ranked list is recovered from the prose by extractRankedFromProse.
              text: `${query}\n\n${PROSE_INSTRUCTION}`,
            },
          ],
        },
      ],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1 },
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gemini ${resp.status}: ${text.slice(0, 300)}`);
  }

  const raw = (await resp.json()) as unknown;
  const text = extractGeminiText(raw);
  const ranked = await extractRankedFromProse(text);
  return { raw, ranked };
}

function extractGeminiText(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const candidates = (raw as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return "";
  const first = candidates[0] as Record<string, unknown>;
  const content = first.content as Record<string, unknown> | undefined;
  const parts = content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((p) => {
      if (!p || typeof p !== "object") return "";
      const t = (p as Record<string, unknown>).text;
      return typeof t === "string" ? t : "";
    })
    .join("\n");
}
