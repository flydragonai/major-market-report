"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tiny "?" badge that reveals a text bubble on hover (mouse) AND click/tap
 * (touch + click). Native `title` tooltips are hover-only and effectively
 * invisible on phones, so we own the popover.
 *
 * The bubble is rendered into a React portal on document.body and positioned
 * with `position: fixed`. This is non-negotiable: every list we use this in
 * (Query breakdown, admin Query performance) sits inside a card with
 * `overflow-hidden` and narrow truncated columns. An absolutely-positioned
 * bubble would get clipped by those ancestors. Portaling escapes the entire
 * stacking + overflow chain so the bubble can sit on top of anything.
 *
 * Behavior:
 *   - Hover (mouseenter)  → show
 *   - Mouseleave          → hide, unless the user clicked to "pin" it
 *   - Click / tap         → toggle a pinned state; pinned stays open after
 *                           the cursor leaves
 *   - Click outside       → close (only when pinned)
 *   - Escape              → close
 *   - Keyboard focus      → show (so tab-navigators see it too)
 *   - Scroll / resize     → reposition while open so the bubble tracks
 *                           the trigger
 */
/**
 * Pass `text` for a plain-string bubble (existing call sites). Pass
 * `children` instead when you need rich content — bulleted lists, links,
 * a structured breakdown. When both are passed, `children` wins.
 * `ariaLabel` is required when using `children` since we can't auto-
 * derive a screen-reader label from arbitrary ReactNode.
 */
export function HoverHint({
  text,
  children,
  ariaLabel,
}: {
  text?: string;
  children?: React.ReactNode;
  ariaLabel?: string;
}) {
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);

  const open = hover || pinned || focused;

  // Portals can't render until we know document.body exists (SSR safety).
  useEffect(() => {
    setMounted(true);
  }, []);

  // Position the bubble under the trigger in viewport coordinates. If the
  // bubble's right edge would clip past the viewport we shift it left so it
  // stays fully visible. Re-runs on every show + on scroll/resize while open.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    function place() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const r = trigger.getBoundingClientRect();
      const bubbleW = bubbleRef.current?.offsetWidth ?? 280;
      const margin = 8;
      let left = r.left;
      if (left + bubbleW > window.innerWidth - margin) {
        left = Math.max(margin, window.innerWidth - bubbleW - margin);
      }
      setPos({ top: r.bottom + 4, left });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Click-outside + Escape — only relevant when the bubble is pinned, since
  // hover/focus close themselves on the matching out event. Outside is
  // "outside the trigger AND outside the bubble" since the bubble lives in a
  // portal and won't be a DOM descendant of the trigger.
  useEffect(() => {
    if (!pinned) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (bubbleRef.current?.contains(t)) return;
      setPinned(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPinned(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [pinned]);

  return (
    <span
      className="relative inline-flex shrink-0"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          // Stop the row-level click handler (some parent rows toggle on
          // click) from firing when the user is just opening the hint.
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        aria-label={ariaLabel ?? (text ? `More info: ${text}` : "More info")}
        aria-expanded={open}
        className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-zinc-300 text-[9px] leading-none text-zinc-500 cursor-help hover:border-zinc-400 hover:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-zinc-400"
      >
        ?
      </button>
      {mounted && open && pos &&
        createPortal(
          <div
            ref={bubbleRef}
            role="tooltip"
            style={{ position: "fixed", top: pos.top, left: pos.left }}
            // z-[60] sits above the run-details modal (z-50) and any sticky
            // headers in the page chrome.
            className="z-[60] max-w-xs w-max rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-foreground shadow-lg whitespace-normal leading-snug pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            onMouseEnter={() => setHover(true)}
            onMouseLeave={() => setHover(false)}
          >
            {children ?? text}
          </div>,
          document.body,
        )}
    </span>
  );
}
