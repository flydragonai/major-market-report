"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { startMarketRun, fireMarketScoring } from "@/lib/scoreMarket";
import { mmrClient } from "@/lib/db/mmrClient";
import { SELECTABLE_KINDS } from "@/lib/citations/categories";

/**
 * Server action target for the "Run scoring" button.
 *
 * The synchronous prelude (`startMarketRun`) writes the mmr_runs row in
 * `running` state and returns the runId — that's all we await. The slow
 * LLM fan-out (`fireMarketScoring`) is kicked off as a fire-and-forget
 * promise so the action returns within milliseconds and the client can
 * immediately router.refresh() to pick up the new run row and start
 * polling the progress bar.
 *
 * Background-task notes:
 *   - In `next dev`, the Node process keeps the unawaited promise alive
 *     until it completes — exactly what we want for local + monthly
 *     manual runs.
 *   - On serverless deploys (Vercel), an unawaited promise gets killed
 *     when the response is sent. If/when this app ships there, swap
 *     this for an explicit job queue (Inngest, QStash, cron + worker,
 *     etc.). Today the app runs on a long-lived server, so we don't
 *     need that yet.
 *
 * revalidatePath fires twice: once now (so the new run row shows up
 * immediately) and once when the background scoring resolves (so the
 * page picks up the final 'complete' state even if no one had a tab
 * open during the poll).
 */
export async function runMarketScoringAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const slug = String(formData.get("slug") ?? "").trim();
  const force = formData.get("force") === "1";
  const mock = formData.get("mock") === "1";
  if (!slug) {
    return { ok: false, message: "Missing market slug." };
  }
  try {
    const start = await startMarketRun(slug, { force });
    if (start.status === "error") {
      return { ok: false, message: start.message };
    }
    if (start.status === "skipped") {
      revalidatePath("/");
      return { ok: true, message: start.message };
    }
    // Fire-and-forget the slow phase. revalidate after it lands so the
    // page re-renders the final complete state.
    void fireMarketScoring(start.runId, start.market, { mock })
      .then(() => revalidatePath("/"))
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("fireMarketScoring failed:", msg);
      });
    revalidatePath("/");
    return {
      ok: true,
      message: `Scoring started for ${start.market.label}.`,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}

/**
 * Save (or update) a domain classification override. Called from the
 * "Unclassified domains" triage table at the bottom of the report.
 *
 * Domain is normalized (lowercased, www-stripped) before write so the
 * read-side override layer in lib/citations/overrides.ts matches with
 * the same shape.
 *
 * Brand stays free-text — operators don't usually need it, but if they
 * want to group two domains under one brand slug (e.g. set both
 * "lamacchiarealty.com" and "lamacchia.com" to brand="lamacchia"), they
 * can paste a slug into the brand input. UI omits it for v1; pass null.
 */
export async function saveDomainOverrideAction(
  formData: FormData,
): Promise<{ ok: boolean; message: string }> {
  await requireAdmin();
  const rawDomain = String(formData.get("domain") ?? "").trim();
  const kind = String(formData.get("kind") ?? "").trim();
  const brandRaw = String(formData.get("brand") ?? "").trim();
  const brand = brandRaw === "" ? null : brandRaw.toLowerCase();
  if (!rawDomain || !kind) {
    return { ok: false, message: "Missing domain or kind." };
  }
  if (!SELECTABLE_KINDS.includes(kind as (typeof SELECTABLE_KINDS)[number])) {
    return { ok: false, message: `Unknown kind: ${kind}` };
  }
  const domain = rawDomain.toLowerCase().replace(/^www\./, "");
  try {
    const sb = mmrClient();
    const { error } = await sb
      .from("mmr_domain_overrides")
      .upsert(
        {
          domain,
          kind,
          brand,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "domain" },
      );
    if (error) throw error;
    revalidatePath("/");
    return { ok: true, message: `Saved ${domain} → ${kind}.` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, message: msg };
  }
}
