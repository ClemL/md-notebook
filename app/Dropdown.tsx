"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Btn from "./Btn";

const GAP = 6;
const MARGIN = 8;
const MIN_HEIGHT = 160;

/**
 * A header dropdown that always fits the screen it is on.
 *
 * The panel is positioned against the viewport rather than its button, so it can be clamped to
 * the visible height and scrolled internally — on a phone the old absolutely-positioned menu ran
 * past the bottom edge with no way to reach the last items, since an overlay cannot be brought
 * into view by scrolling the page behind it.
 *
 * It renders through a portal because the sticky header uses backdrop-filter, which makes that
 * header the containing block for fixed-position descendants; measured against the header the
 * panel lands in the wrong place.
 */
export default function Dropdown({
  label,
  tip,
  hotkey,
  align = "right",
  children,
}: {
  label: ReactNode;
  tip: string;
  hotkey?: string;
  align?: "left" | "right";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const position = useCallback(() => {
    const menu = menuRef.current;
    const anchor = btnRef.current;
    if (!menu || !anchor) return;

    const b = anchor.getBoundingClientRect();
    // The visual viewport shrinks for the URL bar and on-screen keyboard, but can also report
    // slightly larger than the layout viewport; the smaller of the two is what actually fits.
    const vw = Math.min(window.innerWidth, window.visualViewport?.width ?? Infinity);
    const vh = Math.min(window.innerHeight, window.visualViewport?.height ?? Infinity);

    menu.style.maxWidth = `${vw - MARGIN * 2}px`;
    menu.style.maxHeight = `${Math.max(MIN_HEIGHT, vh - b.bottom - GAP - MARGIN)}px`;

    const width = menu.offsetWidth;
    const preferred = align === "right" ? b.right - width : b.left;
    menu.style.left = `${Math.min(Math.max(MARGIN, preferred), Math.max(MARGIN, vw - width - MARGIN))}px`;
    menu.style.top = `${b.bottom + GAP}px`;
  }, [align]);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    // A foldable changes both axes mid-session; the keyboard changes the visual viewport.
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    window.visualViewport?.addEventListener("resize", position);
    return () => {
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      window.visualViewport?.removeEventListener("resize", position);
    };
  }, [open, position]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node) && !menuRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  return (
    <div className="menuwrap" ref={wrapRef}>
      <div ref={btnRef} className="menuwrap-anchor">
        <Btn tip={tip} hotkey={hotkey} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {label}
        </Btn>
      </div>
      {open &&
        mounted &&
        createPortal(
          <div
            className="menu"
            role="menu"
            ref={menuRef}
            // An action closes the menu; a checkbox option leaves it open to set another.
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("button")) setOpen(false);
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </div>
  );
}
