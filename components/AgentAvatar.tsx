"use client";

import { useEffect, useState } from "react";

/**
 * Brand chip for an agent row. Tries the Google favicon service first;
 * falls back to a colored letter tile generated from the agent's
 * initials when the favicon errors OR when there's no domain to ask
 * for one. The tile color is hashed from the name so it's stable
 * across renders and visually distinct between adjacent agents.
 *
 * Client component because we need an onError handler — server-rendered
 * <img> can't tell us when Google's favicon fetch returned blank/404.
 * Cheap to mount (a few state hooks, no effects).
 */
export function AgentAvatar({
  name,
  domain,
  size = 20,
}: {
  name: string;
  domain: string | null;
  /** Square pixel size — defaults to 20 so it slots into a list row
   *  without overwhelming the name. Bigger sizes work fine; the tile
   *  font scales proportionally. */
  size?: number;
}) {
  // Pre-validate the favicon via a JS Image() before we ever mount it
  // into the DOM. Catches three problem modes that the naive
  // <img onError> approach misses:
  //
  //   1. Sites that serve an HTML 404 page at /favicon.ico with HTTP 200
  //      (no onError, naturalWidth=0).
  //   2. Sites that return a tiny placeholder/transparent pixel that's
  //      technically a valid image but visually broken
  //      (naturalWidth tiny but not zero — typical for some CDN-default
  //      "no favicon" fallbacks).
  //   3. Sites whose /favicon.ico races a different cached error state
  //      in React so the onLoad handler attaches too late to react.
  //
  // The Image() constructor runs entirely outside the DOM tree, so we
  // own the load/error lifecycle and don't have to fight React's mount
  // ordering. Once we know the source is good, we render the <img> with
  // that confirmed src; otherwise we render the letter tile.
  const cleanDomain = domain ? stripDomain(domain) : null;
  const candidate = cleanDomain ? `https://${cleanDomain}/favicon.ico` : null;
  const [goodSrc, setGoodSrc] = useState<string | null>(null);
  const [tested, setTested] = useState(!candidate);

  useEffect(() => {
    if (!candidate) {
      setGoodSrc(null);
      setTested(true);
      return;
    }
    setGoodSrc(null);
    setTested(false);
    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (cancelled) return;
      // Real favicons are at least ~16×16. Anything below this is either
      // a 1-px transparent fallback, the browser's broken-image SVG, or
      // a tiny placeholder served by a CDN — all of which render as
      // unusable junk in the row.
      if (probe.naturalWidth >= 8 && probe.naturalHeight >= 8) {
        setGoodSrc(candidate);
      }
      setTested(true);
    };
    probe.onerror = () => {
      if (cancelled) return;
      setTested(true);
    };
    probe.referrerPolicy = "no-referrer";
    probe.src = candidate;
    return () => {
      cancelled = true;
    };
  }, [candidate]);

  // While probing (first paint), show the letter tile rather than an
  // empty box. If the probe fails, the tile stays. If it succeeds, the
  // tile is replaced by the validated favicon.
  if (!tested || !goodSrc) {
    return <LetterTile name={name} size={size} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={goodSrc}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      loading="lazy"
      className="rounded-sm shrink-0 object-contain bg-white"
      style={{ width: size, height: size }}
    />
  );
}

/** Strip protocol, www., trailing slash, and any path. The favicon
 *  service wants a bare host like "remax.com", not the full URL we
 *  sometimes carry on the client record (e.g. "https://timharvey..."). */
function stripDomain(d: string): string {
  let out = d.trim().toLowerCase();
  out = out.replace(/^https?:\/\//, "");
  out = out.replace(/^www\./, "");
  // Drop anything after the host (path, querystring, trailing slash).
  const slash = out.indexOf("/");
  if (slash !== -1) out = out.slice(0, slash);
  return out;
}

function LetterTile({ name, size }: { name: string; size: number }) {
  const initials = getInitials(name);
  const color = colorFor(name);
  return (
    <span
      className="inline-flex items-center justify-center rounded-sm shrink-0 text-white font-medium tabular-nums"
      style={{
        width: size,
        height: size,
        background: color,
        // Initials sit at ~50% of tile height — readable at any size
        // from 16px (tight rows) up to 48px (larger headers).
        fontSize: Math.round(size * 0.46),
        lineHeight: 1,
        fontFamily: "var(--font-display)",
      }}
      aria-hidden
    >
      {initials}
    </span>
  );
}

/** First letter of first + first letter of last (or just first if there's
 *  only one word). Strips parentheticals so "Tim Harvey (Lead, Harvey
 *  Team)" → "TH" not "T(". */
function getInitials(name: string): string {
  const cleaned = name
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-zA-Z\s'-]/g, " ")
    .trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Deterministic HSL color from the name. Restricted hue range keeps
 *  things in a "brand-y" palette (avoids neon yellows / sickly greens),
 *  uniform saturation + lightness keeps adjacent tiles visually balanced. */
function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  // Spread hue across the full wheel but step in primes to maximize
  // distance between similarly-spelled names. 45% lightness so white
  // text reads clearly on every tile.
  const hue = (hash * 137) % 360;
  return `hsl(${hue}deg, 45%, 45%)`;
}
