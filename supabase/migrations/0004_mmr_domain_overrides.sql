-- User-curated overrides to the citation classifier.
--
-- categories.ts has a hardcoded registry of known portals, brokerages,
-- directories, etc. Anything not matched there used to fall through to
-- `agent_site` — which inflated the Agent-owned bucket with directories,
-- listicles, government pages, and PR articles. After this migration:
--
--   1. The classifier's fall-through default becomes `unclassified`.
--   2. Domains a human has classified land here, and the read-side
--      override layer wins over the hardcoded registry — so an operator
--      can correct a misclassification without a code change.
--   3. The Major Market Report's UI lists every unclassified domain at
--      the bottom of the page with a kind selector + save button. Saving
--      writes a row here.
--
-- Domain stored lowercase, no scheme, no www. — the same shape the
-- classifier uses internally (rollupDisplayDomain output). Brand is the
-- canonical slug ("realtor.com" → "realtor") used by aggregation views
-- that group by brand. Nullable because not every kind has a brand.

CREATE TABLE IF NOT EXISTS public.mmr_domain_overrides (
  domain      text PRIMARY KEY,
  kind        text NOT NULL CHECK (kind IN (
    'portal','brokerage','agent_site','gbp','knowledge_graph','video',
    'review','directory','pr','social','local_media','wiki','other',
    'government','jobs'
  )),
  brand       text,
  -- Audit trail for who classified what, when. classified_by stays a
  -- free-text string ("admin") for now since the report is single-tenant;
  -- when multiple operators arrive, swap to auth.uid().
  classified_by text NOT NULL DEFAULT 'admin',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mmr_domain_overrides ENABLE ROW LEVEL SECURITY;

-- Same shape as the other mmr_* tables: any authenticated reader can
-- pull. Writes go through the server-action service-role key (RLS
-- bypass).
CREATE POLICY "authenticated_read_overrides"
  ON public.mmr_domain_overrides
  FOR SELECT
  TO authenticated
  USING (true);
