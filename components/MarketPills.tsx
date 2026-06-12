"use client";

import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import type { Market } from "@/lib/markets";

/**
 * Pill strip for the Major Market Report. "All" always pinned first, then
 * one chip per tracked market. URL-param backed (?m=slug) so a copied link
 * lands exactly where the operator was.
 *
 * Each chip carries an optional count (mention rows the market contributed),
 * which doubles as a "this market has data" tell — empty markets show "—".
 */
export function MarketPills({
  markets,
  countsBySlug,
  selectedSlug,
}: {
  markets: Market[];
  countsBySlug: Record<string, number>;
  selectedSlug: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <Pill
        slug="all"
        label="All markets"
        count={countsBySlug["all"] ?? 0}
        active={selectedSlug === "all"}
      />
      {markets.map((m) => (
        <Pill
          key={m.slug}
          slug={m.slug}
          label={m.label}
          count={countsBySlug[m.slug] ?? 0}
          active={selectedSlug === m.slug}
        />
      ))}
    </div>
  );
}

function Pill({
  slug,
  label,
  count,
  active,
}: {
  slug: string;
  label: string;
  count: number;
  active: boolean;
}) {
  const sp = useSearchParams();
  const pathname = usePathname() ?? "/";
  const next = new URLSearchParams(sp?.toString() ?? "");
  if (slug === "all") next.delete("m");
  else next.set("m", slug);
  const qs = next.toString();
  const href = qs ? `${pathname}?${qs}` : pathname;
  return (
    <Link
      href={href}
      prefetch={false}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs uppercase tracking-widest transition-colors ${
        active
          ? "bg-gold/15 text-gold border-gold/40"
          : "bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-foreground"
      }`}
      style={{ fontFamily: "var(--font-display)" }}
    >
      <span>{label}</span>
      <span
        className={`tabular-nums text-[10px] px-1.5 py-0.5 rounded-full ${
          active
            ? "bg-gold/20 text-gold"
            : "bg-zinc-100 text-zinc-500"
        }`}
      >
        {count > 0 ? count.toLocaleString() : "—"}
      </span>
    </Link>
  );
}
