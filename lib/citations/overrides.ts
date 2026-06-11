import { mmrClient } from "../db/mmrClient";
import type { CitationKind } from "./categories";

/**
 * User-curated classifier overrides. Loaded once per page render and
 * applied to every citation AFTER the hardcoded classifier in
 * categories.ts has run — so the operator's saved decision wins over
 * the registry's default.
 *
 * Stored in mmr_domain_overrides (see migration 0004). Domain is the
 * lowercase, www-stripped registrable form — the same shape
 * rollupDisplayDomain produces.
 */
export type DomainOverride = {
  kind: CitationKind;
  brand: string | null;
};

export type OverrideMap = Map<string, DomainOverride>;

const EMPTY: OverrideMap = new Map();

export async function loadDomainOverrides(): Promise<OverrideMap> {
  try {
    const sb = mmrClient();
    const { data, error } = await sb
      .from("mmr_domain_overrides")
      .select("domain, kind, brand");
    if (error) {
      // Don't fail the whole page render if the overrides query errors —
      // fall through to no-overrides, classifier defaults will apply.
      console.warn("loadDomainOverrides:", error.message);
      return EMPTY;
    }
    const m: OverrideMap = new Map();
    for (const row of data ?? []) {
      m.set(row.domain as string, {
        kind: row.kind as CitationKind,
        brand: (row.brand as string | null) ?? null,
      });
    }
    return m;
  } catch (e) {
    console.warn("loadDomainOverrides crash:", e);
    return EMPTY;
  }
}

/** Apply overrides to a freshly-classified citation. Subdomain rollup
 *  mirrors the classifier's: m.foo.com → foo.com so a single override
 *  for "foo.com" wins for every subdomain. */
export function applyOverride(
  domain: string | null,
  overrides: OverrideMap,
): DomainOverride | null {
  if (!domain) return null;
  const labels = domain.toLowerCase().replace(/^www\./, "").split(".");
  for (let i = 0; i <= labels.length - 2; i++) {
    const candidate = labels.slice(i).join(".");
    const hit = overrides.get(candidate);
    if (hit) return hit;
  }
  return null;
}
