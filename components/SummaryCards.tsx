"use client";

import { HoverHint } from "./HoverHint";
import { PLATFORM_ORDER, platformLabel } from "@/lib/platforms";
import type { PlatformQueryCount } from "@/lib/marketData";

/**
 * Top-of-page summary tiles for the active market scope.
 *
 * Four tiles:
 *   1. Queries run        — total non-error response rows (each row is
 *                           one model × query execution).
 *   2. Citations          — total citation entries across all responses.
 *   3. Agents ranked      — count of distinct agents named in at least
 *                           one model's top-list across this scope.
 *   4. Queries / platform — per-model breakdown chips. `?` reveals the
 *                           query template list so an operator (or a
 *                           client peeking) can see exactly what we ask.
 *
 * Numbers track the active market — switching to a market pill re-renders
 * the page with that bucket and the cards reflect it. Server-rendered
 * counts; the `?` popovers are the only client interactivity.
 */
export function SummaryCards({
  totalQueries,
  totalCitations,
  totalAgents,
  perPlatformQueries,
  queryTemplates,
  scopeLabel,
}: {
  totalQueries: number;
  totalCitations: number;
  /** Distinct agents on the leaderboard for this scope. Each agent
   *  counts once regardless of how many models named them. */
  totalAgents: number;
  perPlatformQueries: PlatformQueryCount[];
  /** Query template strings, with `{market}` left as a literal placeholder
   *  so the operator sees the shape, not a specific market. */
  queryTemplates: string[];
  /** "All markets" or the market label — shown under each top-line number
   *  so the scope is unambiguous when the user hits the page mid-scroll. */
  scopeLabel: string;
}) {
  // Sort the per-platform chips by the canonical PLATFORM_ORDER so the
  // operator's mental map stays stable across markets even when one
  // model returned more rows than another in a given scope.
  const sortedPlatforms = [...perPlatformQueries].sort(
    (a, b) =>
      PLATFORM_ORDER.indexOf(a.model as (typeof PLATFORM_ORDER)[number]) -
      PLATFORM_ORDER.indexOf(b.model as (typeof PLATFORM_ORDER)[number]),
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      <SummaryCard
        label={
          <span className="inline-flex items-baseline gap-1">
            Queries run
            <HoverHint
              ariaLabel="What counts as a query"
              text="One per (model × query template × run). Errored runs are excluded."
            />
          </span>
        }
        value={totalQueries.toLocaleString()}
        sublabel={scopeLabel}
      />
      <SummaryCard
        label="Citations collected"
        value={totalCitations.toLocaleString()}
        sublabel={scopeLabel}
      />
      <SummaryCard
        label={
          <span className="inline-flex items-baseline gap-1">
            Agents ranked
            <HoverHint
              ariaLabel="What counts as a ranked agent"
              text="Distinct agents named in at least one model's ranked list across this scope. Same agent named by multiple models counts once."
            />
          </span>
        }
        value={totalAgents.toLocaleString()}
        sublabel={scopeLabel}
      />
      <SummaryCard
        label={
          <span className="inline-flex items-baseline gap-1">
            Queries by platform
            <HoverHint ariaLabel="Query templates" wide>
              <div>
                <div className="font-semibold mb-1 text-foreground">
                  Core query templates
                </div>
                <div className="text-[10.5px] text-zinc-500 mb-1.5 leading-tight">
                  Same set runs against every market, against every model.{" "}
                  <code className="text-foreground">{"{market}"}</code> is
                  filled in per market at run time.
                </div>
                {queryTemplates.length === 0 ? (
                  <div className="text-zinc-500">
                    No templates configured.
                  </div>
                ) : (
                  <ul className="space-y-0.5">
                    {queryTemplates.map((t, i) => (
                      <li key={i}>· {t}</li>
                    ))}
                  </ul>
                )}
              </div>
            </HoverHint>
          </span>
        }
        // No headline number — the breakdown chips ARE the value.
        valueNode={
          sortedPlatforms.length === 0 ? (
            <div className="text-2xl text-zinc-300 tabular-nums">—</div>
          ) : (
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
              {sortedPlatforms.map((p) => (
                <div
                  key={p.model}
                  className="inline-flex items-baseline gap-1.5"
                >
                  <span
                    className="text-2xl tabular-nums"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {p.count.toLocaleString()}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-muted">
                    {platformLabel(p.model)}
                  </span>
                </div>
              ))}
            </div>
          )
        }
        sublabel={scopeLabel}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  valueNode,
  sublabel,
}: {
  label: React.ReactNode;
  /** Headline number as a string. Provide either `value` (single number)
   *  or `valueNode` (custom render — used for the per-platform breakdown
   *  card). When both are passed, valueNode wins. */
  value?: string;
  valueNode?: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="border border-zinc-200 rounded-2xl bg-white p-4 sm:p-5 flex flex-col gap-1.5 min-h-[112px]">
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted">
        {label}
      </div>
      {valueNode ?? (
        <div
          className="text-3xl sm:text-4xl tabular-nums leading-none"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {value}
        </div>
      )}
      {sublabel && (
        <div className="text-[11px] text-zinc-400 mt-auto">{sublabel}</div>
      )}
    </div>
  );
}
