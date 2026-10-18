"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Short description shown in the hover tooltip. */
  tip: string;
  /** Hotkey shown on the right of the tooltip, e.g. "Ctrl+K". Omit when there is none. */
  hotkey?: string;
  /** Tooltip placement; cell toolbars sit close to the top of the viewport. */
  place?: "top" | "bottom";
  /** Renders the button as the most recent copy/export action. */
  flash?: boolean;
  children: ReactNode;
};

export default function Btn({ tip, hotkey, place = "bottom", flash, children, ...rest }: BtnProps) {
  const label = hotkey ? `${tip} (${hotkey})` : tip;
  return (
    <span className={`tipwrap tip-${place}`}>
      <button {...rest} aria-label={label} data-flash={flash ? "on" : undefined}>
        {children}
      </button>
      <span className="tip" role="tooltip">
        {tip}
        {hotkey && <kbd>{hotkey}</kbd>}
      </span>
    </span>
  );
}

/** The arrow-into-tray glyph used by the per-entry download buttons. */
export function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M8 2v8m0 0L4.5 6.5M8 10l3.5-3.5M2.5 11.5v2h11v-2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The magnifier on the header's search-and-command box. */
export function SearchIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10.4 10.4L14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
