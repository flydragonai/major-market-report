-- Roll `local_media` into `pr`.
--
-- Background: we used to split press coverage into two kinds:
--   `pr`          — wire-placed releases (PRNewswire, BusinessWire, etc.)
--   `local_media` — editorial regional press (Boston Globe, Patch.com,
--                   bizjournals, Texas Monthly, the city magazine
--                   franchise, etc.)
--
-- The earned-vs-placed distinction was conceptually clean but not
-- load-bearing in any of the report's surfaces — donut, top-cited list,
-- and leaderboard ranking all behaved the same whether the citation
-- was earned or placed. Splitting it just added a second pill of
-- roughly the same color and a triage decision the operator didn't
-- really need to make.
--
-- The classifier now writes `kind = 'pr'` for everything in this
-- collapsed bucket. Brand slugs preserve the split for any future
-- analysis ("wire:prnewswire" vs "editorial:bostonglobe") even though
-- the report doesn't render two slices today.
--
-- This migration:
--   1. Rewrites any saved operator override of `local_media` → `pr`
--      so we don't orphan their decisions.
--   2. Drops the CHECK constraint that allowed `local_media` and
--      re-adds it without that value, so future writes can't reach
--      the dead kind.

UPDATE public.mmr_domain_overrides
SET kind = 'pr',
    updated_at = NOW()
WHERE kind = 'local_media';

ALTER TABLE public.mmr_domain_overrides
  DROP CONSTRAINT IF EXISTS mmr_domain_overrides_kind_check;

ALTER TABLE public.mmr_domain_overrides
  ADD CONSTRAINT mmr_domain_overrides_kind_check
  CHECK (kind IN (
    'portal','brokerage','agent_site','gbp','knowledge_graph','video',
    'review','directory','pr','listicle','social','wiki',
    'government','jobs','industry_news','other'
  ));
