"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  SELECTABLE_KINDS,
  CITATION_KIND_LABEL,
  type CitationKind,
} from "@/lib/citations/categories";
import type { UnclassifiedDomain } from "@/lib/marketData";
import { saveDomainOverrideAction } from "@/app/actions";

/**
 * Bottom-of-page triage table. Lists every domain in the active scope
 * that the classifier couldn't bucket — operator picks the right kind
 * from the dropdown and hits Save. Saved decisions persist to
 * mmr_domain_overrides and take effect on the next page render via the
 * override layer in lib/citations/overrides.ts.
 *
 * Bulk-friendly: each row's form is independent so an operator can
 * power through 30 unknown domains in a minute without losing their
 * place. router.refresh() runs after each save so the row drops out of
 * the list (since the next read no longer classifies it as
 * unclassified).
 */
export function UnclassifiedDomains({
  rows,
}: {
  rows: UnclassifiedDomain[];
}) {
  if (rows.length === 0) {
    return (
      <div className="border border-zinc-200 rounded-2xl bg-white p-6 text-sm text-muted">
        Nothing to triage — every cited domain has a classification. 🎉
      </div>
    );
  }
  return (
    <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="text-xl flex items-baseline gap-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Unclassified domains
          <span
            className="text-sm tabular-nums text-zinc-400"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {rows.length}
          </span>
        </h2>
        <div className="text-xs text-muted">
          Saves take effect on next render
        </div>
      </div>
      <p className="text-sm text-zinc-600 mb-4 max-w-2xl">
        These cited domains fell through the classifier&apos;s registry. Pick
        the right kind for each one and the choice persists — every future
        report reclassifies on read.
      </p>
      <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-lg overflow-hidden">
        {rows.map((r) => (
          <UnclassifiedRow key={r.domain} row={r} />
        ))}
      </ul>
    </div>
  );
}

function UnclassifiedRow({ row }: { row: UnclassifiedDomain }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  // Default the picker to "Agent-owned" — most unknown real-estate
  // domains genuinely are individual agent or team sites, so pre-selecting
  // it saves a click on the common case. Operator can override per row.
  const [kind, setKind] = useState<CitationKind>("agent_site");
  const [outcome, setOutcome] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(formData: FormData) {
    setBusy(true);
    setOutcome(null);
    const result = await saveDomainOverrideAction(formData);
    setOutcome(result);
    setBusy(false);
    if (result.ok) {
      // Auto-clear toast + refresh so the row falls out of the unclassified
      // list (re-read picks up the override).
      startTransition(() => {
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
          <div className="text-sm text-foreground truncate">{row.domain}</div>
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
      <span
        className="text-xs tabular-nums text-muted shrink-0"
        title="Citations on this domain in the current scope"
      >
        ×{row.count}
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
          disabled={busy}
          className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] uppercase tracking-widest border transition-colors ${
            busy
              ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-wait"
              : "bg-gold/15 border-gold/40 text-gold hover:bg-gold/25"
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
