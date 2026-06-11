-- Add "industry_news" to the citation kind whitelist.
--
-- Real estate trade press — Inman, HousingWire, RISMedia, The Real Deal,
-- RealTrends-the-publication (vs the directory), Boston Agent Magazine,
-- South Florida Agent Magazine, Propmodo, etc. Editorial coverage from
-- publications that exist specifically to cover the real estate
-- industry.
--
-- Distinct from existing buckets:
--   `local_media`  — general regional press (Boston Globe, Miami Herald)
--                    that happens to cover a real estate story.
--   `pr`           — wire-service press releases (PRNewswire, Newswire).
--   `listicle`     — paid-placement "Top 10 Agents" guest posts dressed
--                    up as editorial.
--   `directory`    — agent aggregators (Zillow, Realtor.com, FastExpert)
--                    even when they publish blog content.
--
-- The point of carving this out: industry-news citations are the
-- closest thing to "earned media" in the AI-visibility deck — they
-- carry editorial weight that listicles and PR wires don't, and a
-- client deciding whether to pitch trade press as a strategy needs to
-- see this as its own slice.

ALTER TABLE public.mmr_domain_overrides
  DROP CONSTRAINT IF EXISTS mmr_domain_overrides_kind_check;

ALTER TABLE public.mmr_domain_overrides
  ADD CONSTRAINT mmr_domain_overrides_kind_check
  CHECK (kind IN (
    'portal','brokerage','agent_site','gbp','knowledge_graph','video',
    'review','directory','pr','listicle','social','local_media','wiki',
    'government','jobs','industry_news','other'
  ));
