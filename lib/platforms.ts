/**
 * Canonical platform (model) labels + display order.
 *
 * Source of truth so CitationAnalysisSection's filter pills, the
 * SummaryCards "Queries by platform" tile, and any future surface stay
 * in sync without local copies drifting.
 *
 * Claude (anthropic) is in the order array even though the current
 * scorer doesn't fan out to it — we keep the slot so a future opt-in
 * doesn't require touching every consumer.
 */

export const PLATFORM_ORDER = [
  "openai",
  "gemini",
  "google_aio",
  "anthropic",
] as const;

export const PLATFORM_LABEL: Record<string, string> = {
  openai: "ChatGPT",
  gemini: "Gemini",
  google_aio: "Google AIO",
  anthropic: "Claude",
};

export function platformLabel(model: string): string {
  return PLATFORM_LABEL[model] ?? model;
}
