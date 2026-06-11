"use client";

import { useState } from "react";
import {
  CITATION_KIND_LABEL,
  type CitationKind,
} from "@/lib/citations/categories";
import type { CitedDomain } from "@/lib/citations/topDomains";

/**
 * The "Top cited domains" list card — favicon · domain · kind pill · bar ·
 * count + %. Pill widths are fixed (5.5rem) so bar left edges align across
 * rows regardless of label length ("KG" vs "DIRECTORY"). Clicking a row
 * toggles the per-domain URL list open beneath.
 *
 * Lifted from client-reporting's admin overview verbatim — same shape, same
 * interactions, same compact bucket labels.
 */
export function TopCitedDomainsCard({ rows }: { rows: CitedDomain[] }) {
  const maxCount = rows[0]?.count ?? 0;
  return (
    <div className="border border-zinc-200 rounded-xl bg-zinc-50 flex flex-col overflow-hidden max-h-[28rem] lg:max-h-none lg:absolute lg:inset-0">
      <div className="p-5 pb-3 flex items-baseline justify-between">
        <div
          className="text-[10px] uppercase tracking-[0.3em] text-zinc-500"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Top cited domains
        </div>
        {rows.length > 0 && (
          <div className="text-xs text-muted">Top {rows.length}</div>
        )}
      </div>
      {rows.length === 0 ? (
        <div className="px-5 pb-5 text-xs text-muted">
          No citations to summarize.
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-3">
          <ul className="space-y-0.5">
            {rows.map((r) => (
              <CitedDomainRow key={r.domain} row={r} maxCount={maxCount} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const CITATION_KIND_SHORT: Record<NonNullable<CitedDomain["kind"]>, string> = {
  portal: "Portal",
  brokerage: "Brokerage",
  agent_site: "Agent",
  gbp: "GBP",
  knowledge_graph: "KG",
  video: "Video",
  review: "Review",
  directory: "Directory",
  pr: "PR",
  listicle: "Listicle",
  social: "Social",
  local_media: "Local",
  wiki: "Wiki",
  government: "Gov",
  jobs: "Jobs",
  other: "Other",
  unclassified: "?",
};

function CitedDomainRow({
  row,
  maxCount,
}: {
  row: CitedDomain;
  maxCount: number;
}) {
  const [open, setOpen] = useState(false);
  const fillPct = maxCount > 0 ? (row.count / maxCount) * 100 : 0;
  return (
    <li className="rounded-md hover:bg-white/70">
      <div className="flex items-center gap-2.5 px-2 py-1.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(row.domain)}&sz=32`}
          alt=""
          width={16}
          height={16}
          className="w-4 h-4 rounded-sm shrink-0"
          loading="lazy"
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 sm:flex-none sm:w-40 min-w-0 text-left text-sm text-foreground truncate hover:text-foreground/80"
          title={`${row.domain} — click to ${open ? "hide" : "show"} URL list`}
        >
          {row.domain}
        </button>
        {/* Fixed-width slot so bar left edges align across rows. */}
        <div className="shrink-0 hidden sm:flex w-[5.5rem] justify-start">
          {row.kind && (
            <span
              className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-1.5 py-0.5 text-[9px] uppercase tracking-widest text-zinc-500"
              style={{ fontFamily: "var(--font-display)" }}
              title={CITATION_KIND_LABEL[row.kind]}
            >
              {CITATION_KIND_SHORT[row.kind as CitationKind]}
            </span>
          )}
        </div>
        <div className="hidden sm:block flex-1 relative h-2 bg-zinc-200/60 rounded-sm overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-gold/70 rounded-sm"
            style={{ width: `${fillPct}%` }}
          />
        </div>
        <div className="text-xs tabular-nums w-16 sm:w-20 text-right shrink-0">
          <span className="text-foreground">{row.count}</span>
          <span className="text-muted text-[10px] ml-1">
            {row.pctOfTotal.toFixed(1)}%
          </span>
        </div>
      </div>
      {row.topUrls.length > 0 && (
        <div className={`pl-9 pr-2 pb-2 ${open ? "block" : "hidden"}`}>
          <div
            className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {row.kind ? CITATION_KIND_LABEL[row.kind] : "Mixed"} ·{" "}
            {row.topUrls.length} unique URL
            {row.topUrls.length === 1 ? "" : "s"}
          </div>
          <ul className="max-h-48 overflow-y-auto space-y-0.5 pr-1">
            {row.topUrls.map((u) => (
              <li
                key={u.url}
                className="flex items-baseline gap-2 text-xs"
              >
                <a
                  href={u.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-600 hover:text-gold truncate flex-1"
                  title={u.title ?? u.url}
                >
                  {u.title || u.url}
                </a>
                <span className="text-muted tabular-nums text-[10px] shrink-0">
                  ×{u.count}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
