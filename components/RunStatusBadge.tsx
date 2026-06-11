"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { RunStatus } from "@/lib/runStatus";

/**
 * "Run in progress" indicator. Server-rendered with truthful state from
 * mmr_runs / mmr_responses, then auto-refreshes every 8 seconds via
 * router.refresh() while the badge is mounted — so the operator can
 * watch progress tick up without clicking refresh.
 *
 * router.refresh() re-runs the page's server-side data fetch in place
 * (no full reload), so the citation analysis + leaderboard reflect the
 * new state as soon as the run completes. When the badge unmounts
 * (status flips out of running on the next fetch), the interval stops.
 *
 * 8s cadence picked to balance progress feel vs DB load. Each poll is
 * three light queries — a market lookup, the latest run row, and a
 * count of responses — so the cost is trivial even with many tabs
 * open.
 */
const POLL_MS = 8000;

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(id);
  }, [router]);

  const pct = Math.min(
    100,
    Math.round((status.responsesSoFar / status.expectedTotal) * 100),
  );
  const elapsed = status.startedAt
    ? humanElapsed(Date.now() - new Date(status.startedAt).getTime())
    : null;

  return (
    <div
      className="inline-flex items-center gap-3 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-900"
      role="status"
      aria-live="polite"
    >
      <Spinner />
      <span
        className="text-[11px] uppercase tracking-widest"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Run in progress
      </span>
      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums">
          {status.responsesSoFar}/{status.expectedTotal}
        </span>
        <div
          className="w-20 h-1.5 bg-amber-100 rounded-full overflow-hidden"
          aria-hidden
        >
          <div
            className="h-full bg-amber-500 transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {elapsed && (
        <span className="text-[10px] text-amber-800/70 tabular-nums">
          {elapsed}
        </span>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className="animate-spin"
      aria-hidden
    >
      <circle
        cx="6"
        cy="6"
        r="4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeDasharray="6 16"
        strokeLinecap="round"
      />
    </svg>
  );
}

function humanElapsed(ms: number): string {
  if (ms < 0) return "0s";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem.toString().padStart(2, "0")}s`;
}
