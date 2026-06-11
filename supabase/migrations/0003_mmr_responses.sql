-- Major Market Report — per-(model × query) responses for each run.
--
-- Mirror of score.client_model_results but stripped to what the market
-- report cares about. One row per (run × model × query). Shape match is
-- intentional so the scoring backend's existing prompt → response →
-- extractor pipeline writes here with only the destination table
-- swapped.
--
-- Drilldown / classifier reads use the same jsonb shape as
-- score.client_model_results.{ranked, citations, raw_response}, so
-- consumers can share helpers (categories.ts, extractRanked, etc).

CREATE TABLE IF NOT EXISTS public.mmr_responses (
  response_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES public.mmr_runs (run_id)
                 ON DELETE CASCADE,
  -- One of: openai | gemini | perplexity | google_aio | anthropic.
  -- Free text rather than enum so adding/removing a model is a code
  -- change, not a schema migration.
  model        text NOT NULL,
  -- Query identity matches the querySet convention from client-reporting:
  -- query_id is `${variant}__${subject_slug}` or `oneoff__${id}`.
  query_id     text NOT NULL,
  query_label  text,
  query_text   text,
  query_set    text,
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','ok','error','no_results')),
  -- Ranked agents array. Same shape as score.client_model_results.ranked:
  --   [{ rank: int, name: string, domain: string|null, url: string|null }]
  ranked       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Citation array. Same shape as score.client_model_results.citations:
  --   [{ title, url, domain, kind, brand }]
  -- Reclassified on read by the report; the stored kind is whatever the
  -- classifier said at write time.
  citations    jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Per-row score: rank-points for the leaderboard's top-N rollup.
  -- Optional — the report computes its own per-agent counts from
  -- `ranked` directly; this column is for if/when we want a "market
  -- visibility" headline number per run.
  score        integer NOT NULL DEFAULT 0,
  -- Full provider response. Stored so the drilldown UI can show the AIO
  -- summary markdown, the OpenAI fan-out queries, etc. Largest column —
  -- excluded from list-view selects.
  raw_response jsonb,
  error        text,
  latency_ms   integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- Each (run × model × query) is unique — re-firing a row updates in
  -- place rather than duplicating.
  CONSTRAINT mmr_responses_unique_per_row UNIQUE (run_id, model, query_id)
);

CREATE INDEX IF NOT EXISTS mmr_responses_run_idx
  ON public.mmr_responses (run_id);
CREATE INDEX IF NOT EXISTS mmr_responses_run_model_idx
  ON public.mmr_responses (run_id, model);

ALTER TABLE public.mmr_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_responses"
  ON public.mmr_responses
  FOR SELECT
  TO authenticated
  USING (true);
