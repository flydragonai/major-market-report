"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTABLE_KINDS,
  CITATION_KIND_LABEL,
  type CitationKind,
} from "@/lib/citations/categories";
import { KIND_COLOR } from "@/components/CitationBreakdown";
import type { DomainCatalogRow } from "@/lib/marketData";
import { saveDomainOverrideAction } from "@/app/actions";

/**
 * Full catalog of every cited domain with its current category and a
 * dropdown to change it. Two filter knobs at the top — substring
 * search and per-kind filter pills — because a real catalog runs to
 * hundreds of domains and operators want to slice by "show me everything
 * I currently have as `directory`" to QA a single bucket at a time.
 *
 * The hardcoded classifier (lib/citations/categories.ts) is the source
 * of truth for new domains; this UI just lets operators override
 * specific ones into mmr_domain_overrides. The dropdown defaults to the
 * row's current effective kind, so the Save button only lights up when
 * the operator actually changes something — no accidental save-as-same.
 */
export function DomainCatalogTable({ rows }: { rows: DomainCatalogRow[] }) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<CitationKind | "all">("all");
  const [showOverridesOnly, setShowOverridesOnly] = useState(false);

  // Per-kind tallies for the filter pills. Built once from the full set —
  // pill counts reflect the catalog, not the post-filter view, so the
  // operator always sees the universe to navigate from.
  const countByKind = useMemo(() => {
    const m = new Map<CitationKind, number>();
    for (const r of rows) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
    return m;
  }, [rows]);

  const overrideCount = useMemo(
    () => rows.reduce((n, r) => n + (r.hasOverride ? 1 : 0), 0),
    [rows],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (showOverridesOnly && !r.hasOverride) return false;
      if (q && !r.domain.includes(q)) return false;
      return true;
    });
  }, [rows, query, kindFilter, showOverridesOnly]);

  // Filter-pill order: pin Unclassified first (it's where the work is),
  // then sort the rest by count desc so the biggest buckets surface near
  // the top of the pill row.
  const filterKinds = useMemo(() => {
    const present = Array.from(countByKind.keys());
    const rest = present
      .filter((k) => k !== "unclassified")
      .sort(
        (a, b) =>
          (countByKind.get(b) ?? 0) - (countByKind.get(a) ?? 0) ||
          a.localeCompare(b),
      );
    return present.includes("unclassified")
      ? (["unclassified", ...rest] as CitationKind[])
      : rest;
  }, [countByKind]);

  return (
    <div className="space-y-4">
      {/* Search row */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by domain…"
          className="flex-1 min-w-[200px] max-w-sm border border-zinc-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40"
        />
        <label className="text-xs text-zinc-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={showOverridesOnly}
            onChange={(e) => setShowOverridesOnly(e.target.checked)}
            className="accent-gold"
          />
          Overrides only ({overrideCount})
        </label>
        <span className="text-xs text-muted ml-auto">
          Showing {filtered.length.toLocaleString()} of{" "}
          {rows.length.toLocaleString()}
        </span>
      </div>

      {/* Kind filter pills */}
      <div className="flex flex-wrap gap-1.5">
        <FilterPill
          active={kindFilter === "all"}
          onClick={() => setKindFilter("all")}
          label="All"
          count={rows.length}
          color={null}
        />
        {filterKinds.map((k) => (
          <FilterPill
            key={k}
            active={kindFilter === k}
            onClick={() => setKindFilter(k)}
            label={CITATION_KIND_LABEL[k]}
            count={countByKind.get(k) ?? 0}
            color={KIND_COLOR[k]}
          />
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="border border-zinc-200 rounded-lg p-6 text-sm text-muted text-center">
          No domains match the current filter.
        </div>
      ) : (
        <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden bg-white">
          {filtered.map((r) => (
            <CatalogRow key={r.domain} row={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  label,
  count,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  color: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs transition-colors ${
        active
          ? "bg-foreground text-white border-foreground"
          : "bg-white text-zinc-700 border-zinc-200 hover:border-zinc-400"
      }`}
    >
      {color && (
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      <span>{label}</span>
      <span
        className={`tabular-nums ${active ? "text-white/70" : "text-zinc-400"}`}
      >
        {count}
      </span>
    </button>
  );
}

function CatalogRow({ row }: { row: DomainCatalogRow }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Init the dropdown to the row's current kind so Save only lights up
  // when the operator actually changes something. Exception: if the row
  // is currently `unclassified` (not a selectable target), pre-pick
  // agent_site — matches the UnclassifiedDomains triage default, and the
  // whole point of touching one of these rows is to move off unclassified.
  const initialKind: CitationKind =
    row.kind === "unclassified" ? "agent_site" : row.kind;
  const [kind, setKind] = useState<CitationKind>(initialKind);
  const [outcome, setOutcome] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const dirty = kind !== row.kind;

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setOutcome(null);
    const result = await saveDomainOverrideAction(formData);
    setOutcome(result);
    setBusy(false);
    if (result.ok) {
      startTransition(() => {
        // Toast auto-clears so the row visual settles cleanly after the
        // refresh re-renders it with hasOverride=true.
        setTimeout(() => setOutcome(null), 4000);
        router.refresh();
      });
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-3 px-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(row.domain)}&sz=32`}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 rounded-sm shrink-0"
          loading="lazy"
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm text-foreground truncate flex items-center gap-1.5">
            <span className="truncate">{row.domain}</span>
            {row.hasOverride && (
              <span
                className="text-[9px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5 shrink-0"
                style={{ fontFamily: "var(--font-display)" }}
                title="Operator override active for this domain"
              >
                Override
              </span>
            )}
          </div>
          <a
            href={row.sampleUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-zinc-500 truncate hover:text-foreground block"
            title={row.sampleUrl}
          >
            {row.sampleTitle ?? row.sampleUrl}
          </a>
        </div>
      </div>

      <CurrentKindChip kind={row.kind} />

      <span
        className="text-xs tabular-nums text-muted shrink-0 w-12 text-right"
        title="Citations on this domain across every complete run"
      >
        ×{row.count.toLocaleString()}
      </span>

      <form action={onSubmit} className="flex items-center gap-2 shrink-0">
        <input type="hidden" name="domain" value={row.domain} />
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as CitationKind)}
          disabled={busy}
          className="border border-zinc-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold/40"
        >
          {SELECTABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {CITATION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !dirty}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] uppercase tracking-widest border transition-colors ${
            busy
              ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-wait"
              : dirty
                ? "bg-gold/15 border-gold/40 text-gold hover:bg-gold/25"
                : "bg-zinc-50 border-zinc-200 text-zinc-400 cursor-not-allowed"
          }`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </form>

      {outcome && (
        <span
          className={`text-[10px] basis-full text-right ${
            outcome.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {outcome.message}
        </span>
      )}
    </li>
  );
}

function CurrentKindChip({ kind }: { kind: CitationKind }) {
  const color = KIND_COLOR[kind];
  return (
    <span
      className="hidden sm:inline-flex items-center gap-1.5 text-xs text-zinc-600 shrink-0"
      title="Current effective category (override if present, else classifier)"
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {CITATION_KIND_LABEL[kind]}
    </span>
  );
}
