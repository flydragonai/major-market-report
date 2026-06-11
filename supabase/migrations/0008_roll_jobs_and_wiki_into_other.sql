-- Roll `jobs` and `wiki` into `other`.
--
-- Background: same reasoning as 0007's local_media→pr collapse — these
-- two kinds were conceptually clean but never load-bearing in the
-- report's surfaces. Jobs-board citations on agent queries are signal-
-- free noise (the report doesn't care which board mentioned someone);
-- Wikipedia is a single domain that nobody acts on differently than
-- the rest of the long-tail. Collapsing them into `other` cuts the
-- pill row down and lets operators focus on the buckets that drive
-- strategy decisions.
--
-- The classifier now writes `kind = 'other'` with a brand prefix that
-- preserves the origin so we can recover the split for free:
--   wiki:wikipedia
--   jobs:indeed, jobs:ziprecruiter, jobs:glassdoor, jobs:monster,
--   jobs:simplyhired, jobs:linkedin
--
-- This migration:
--   1. Rewrites saved overrides for `jobs` and `wiki` to `other`.
--   2. Drops the CHECK constraint that allowed them and re-adds it
--      without those values.

UPDATE public.mmr_domain_overrides
SET kind = 'other',
    updated_at = NOW()
WHERE kind IN ('jobs', 'wiki');

ALTER TABLE public.mmr_domain_overrides
  DROP CONSTRAINT IF EXISTS mmr_domain_overrides_kind_check;

ALTER TABLE public.mmr_domain_overrides
  ADD CONSTRAINT mmr_domain_overrides_kind_check
  CHECK (kind IN (
    'portal','brokerage','agent_site','gbp','knowledge_graph','video',
    'review','directory','pr','listicle','social',
    'government','industry_news','other'
  ));
