-- Major Market Report — per-market scoring runs.
--
-- One row per (market × scheduled_for) — typically monthly. Mirrors the
-- shape of score.client_results (status / score / max_score / started_at /
-- completed_at) so the scoring backend's existing run-state machine
-- carries over with minimal new code. Differs in two ways:
--
--   1. Anchored to a market, not a client+location+specialty. No
--      snapshot columns for client identity — there isn't one.
--   2. UNIQUE on (market_id, scheduled_for) so the scheduler is naturally
--      idempotent — re-running the July fire for Manhattan can't
--      duplicate the row.

CREATE TABLE IF NOT EXISTS public.mmr_runs (
  run_id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id     bigint NOT NULL REFERENCES public.mmr_markets (market_id)
                  ON DELETE CASCADE,
  -- Cadence anchor — typically the 1st of the month. Combined with
  -- market_id to deduplicate.
  scheduled_for date NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','running','complete','error')),
  -- Aggregate scoring across all the run's responses, captured once on
  -- completion so the leaderboard can sort by visibility without a per-
  -- request rollup. Generated columns match score.client_results.
  total_score   integer,
  max_score     integer,
  visibility_pct numeric GENERATED ALWAYS AS (
    CASE
      WHEN max_score IS NULL OR max_score = 0 THEN NULL
      ELSE round((total_score::numeric / max_score::numeric) * 100, 2)
    END
  ) STORED,
  -- Operational metadata. error_text only populated when status='error'.
  started_at    timestamptz,
  completed_at  timestamptz,
  error_text    text,
  archived      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mmr_runs_unique_per_month UNIQUE (market_id, scheduled_for)
);

CREATE INDEX IF NOT EXISTS mmr_runs_market_scheduled_idx
  ON public.mmr_runs (market_id, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS mmr_runs_status_idx
  ON public.mmr_runs (status, scheduled_for)
  WHERE archived = false;

ALTER TABLE public.mmr_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_runs"
  ON public.mmr_runs
  FOR SELECT
  TO authenticated
  USING (true);
