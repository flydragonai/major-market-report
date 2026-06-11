import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client for the Major Market Report's own tables (mmr_markets,
 * mmr_runs, mmr_responses). Read-AND-write — the in-app "Run scoring"
 * button writes mmr_runs + mmr_responses, so this is a full service-role
 * key, not a read-only one.
 *
 * Env vars are MMR-prefixed (`MMR_SUPABASE_URL`, `MMR_SUPABASE_KEY`) so
 * an operator running this app alongside the score app (live-ai-
 * visibility-score) can keep both projects' credentials in the same
 * shell environment without one stomping the other.
 */

let cached: SupabaseClient | null = null;

export function mmrClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.MMR_SUPABASE_URL;
  const key = process.env.MMR_SUPABASE_KEY;
  if (!url || !key) {
    throw new Error(
      "MMR_SUPABASE_URL and MMR_SUPABASE_KEY must be set in .env.local",
    );
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
