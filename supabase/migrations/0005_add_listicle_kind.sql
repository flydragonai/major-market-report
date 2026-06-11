-- Add "listicle" to the citation kind whitelist.
--
-- A bucket for the "Top 10 Real Estate Agents in {town}" PR placements
-- that AI keeps surfacing — topagentnetwork.com, propertiesmiami.com,
-- topluxuryrealtorsagents.com, fotober.com, 3best.com, bestrealestate
-- agentsnearme.com, etc. Distinct from `directory` (Zillow, Realtor.com,
-- FastExpert — bona-fide agent aggregators) and from `pr` (newswires,
-- traditional press releases). Listicles sit between: pay-to-feature
-- guest posts dressed up as editorial roundups.
--
-- Pulls listicles out of the noisy "Other" / "Unclassified" buckets so
-- the citation mix can show "how many of our citations come from paid
-- PR placements" cleanly — which is real signal for clients deciding
-- whether to commission more of them.

ALTER TABLE public.mmr_domain_overrides
  DROP CONSTRAINT IF EXISTS mmr_domain_overrides_kind_check;

ALTER TABLE public.mmr_domain_overrides
  ADD CONSTRAINT mmr_domain_overrides_kind_check
  CHECK (kind IN (
    'portal','brokerage','agent_site','gbp','knowledge_graph','video',
    'review','directory','pr','social','local_media','wiki','other',
    'government','jobs','listicle'
  ));
