"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Short description shown in the hover tooltip. */
  tip: string;
  /** Hotkey shown on the right of the tooltip, e.g. "Ctrl+K". Omit when there is none. */
  hotkey?: string;
  /** Tooltip placement; cell toolbars sit close to the top of the viewport. */
  place?: "top" | "bottom";
  children: ReactNode;
};

export default function Btn({ tip, hotkey, place = "bottom", children, ...rest }: BtnProps) {
  const label = hotkey ? `${tip} (${hotkey})` : tip;
  return (
    <span className={`tipwrap tip-${place}`}>
      <button {...rest} aria-label={label}>
        {children}
      </button>
      <span className="tip" role="tooltip">
        {tip}
        {hotkey && <kbd>{hotkey}</kbd>}
      </span>
    </span>
  );
}
