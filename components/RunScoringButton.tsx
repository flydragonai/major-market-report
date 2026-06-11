"use client";

import { useFormStatus } from "react-dom";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runMarketScoringAction } from "@/app/actions";

/**
 * "Run scoring" button. Fires the server action that scores one market and
 * revalidates the page on success. Shows a spinner-ish state during the
 * call and surfaces the result message for ~6 seconds afterward.
 *
 * Disabled for the "all" pseudo-market because there's nothing to score —
 * "All markets" is a derived rollup, not its own bucket. To run every
 * market sequentially the operator clicks each pill's button in turn (or
 * we can add a "Run all" button later if monthly batches become tedious).
 */
export function RunScoringButton({
  slug,
  label,
  disabled: externalDisabled = false,
}: {
  slug: string;
  /** Market label, used in the toast so multi-button pages don't blur. */
  label: string;
  /** Force-disabled by the parent (e.g. a run is already in flight for
   *  this market — driven by the server-fetched RunStatus). */
  disabled?: boolean;
}) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<{ ok: boolean; message: string } | null>(
    null,
  );
  const [, startTransition] = useTransition();
  const disabled = slug === "all" || externalDisabled;

  async function onSubmit(formData: FormData) {
    setOutcome(null);
    const result = await runMarketScoringAction(formData);
    setOutcome(result);
    // The action now returns within milliseconds (it kicks off the slow
    // LLM fan-out as a background promise). Refresh the page so the
    // server re-fetches getActiveRunStatus and the RunStatusBadge renders
    // with the brand-new run row — without this the badge wouldn't show
    // up until the next 8-second poll cycle.
    router.refresh();
    // Auto-clear the toast after 8 seconds.
    startTransition(() => {
      setTimeout(() => setOutcome(null), 8000);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <form action={onSubmit}>
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="force" value="0" />
        <RunButton disabled={disabled} label={label} />
      </form>
      {outcome && (
        <span
          className={`text-xs ${
            outcome.ok ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {outcome.message}
        </span>
      )}
    </div>
  );
}

function RunButton({
  disabled,
  label,
}: {
  disabled: boolean;
  label: string;
}) {
  const { pending } = useFormStatus();
  const isBusy = pending;
  return (
    <button
      type="submit"
      disabled={disabled || isBusy}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest border transition-colors ${
        disabled
          ? "bg-zinc-50 text-zinc-300 border-zinc-100 cursor-not-allowed"
          : isBusy
            ? "bg-zinc-900 text-zinc-50 border-zinc-900 cursor-wait"
            : "bg-gold/15 border-gold/40 text-gold hover:bg-gold/25"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
      title={
        disabled
          ? "Pick a specific market to run scoring."
          : `Run scoring for ${label}`
      }
    >
      {isBusy && <Spinner />}
      <span>{isBusy ? "Running…" : `Run scoring`}</span>
    </button>
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
