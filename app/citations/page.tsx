import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadDomainCatalog } from "@/lib/marketData";
import { DomainCatalogTable } from "@/components/DomainCatalogTable";

export const dynamic = "force-dynamic";

/**
 * Cited-domains management page. Lists every distinct domain seen
 * across complete runs with its current effective category, and lets
 * the operator change any classification via the per-row dropdown.
 *
 * Saves persist to mmr_domain_overrides; the override layer reapplies
 * them on every subsequent page render across the app (this page, the
 * homepage's CitationAnalysisSection, TopCitedDomainsCard, etc.).
 *
 * Distinct from the homepage's "Unclassified domains" triage section,
 * which only shows the work-pile. This page shows the full catalog so
 * an operator can audit any bucket — e.g. open `directory` and confirm
 * the classifier didn't slot a real publication in there.
 */
export default async function CitationsPage() {
  await requireAdmin();
  const rows = await loadDomainCatalog();

  return (
    <main className="min-h-screen px-4 sm:px-6 py-10 max-w-7xl mx-auto">
      <header className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <Link
            href="/"
            className="text-xs uppercase tracking-[0.3em] text-muted hover:text-foreground transition-colors"
            style={{ fontFamily: "var(--font-display)" }}
          >
            ← Back to report
          </Link>
        </div>
        <p
          className="text-xs uppercase tracking-[0.4em] text-muted mb-1"
          style={{ fontFamily: "var(--font-display)" }}
        >
          FlyDragon · Major Market Report
        </p>
        <h1
          className="text-3xl sm:text-5xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Cited domains
        </h1>
        <p className="text-sm text-zinc-600 mt-3 max-w-3xl">
          Every distinct domain we&apos;ve cited across the markets we track.
          The current category for each one — operator override if present,
          classifier default otherwise. Change any of them; the new category
          takes effect on next page render across the whole app.
        </p>
      </header>

      <DomainCatalogTable rows={rows} />
    </main>
  );
}
