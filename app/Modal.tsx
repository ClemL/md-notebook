"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Btn from "./Btn";

/**
 * A titled panel over a dimmed backdrop. Escape, ✕ or a click on the backdrop closes it.
 *
 * While it is open the page behind neither scrolls nor hears a key: the notebook's single-key
 * shortcuts listen on window, and a j, k or dd typed at the dialog must not act on the entries
 * underneath. Focus moves into the panel and returns to whatever opened it.
 */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pressedBackdrop = useRef(false);
  // Read through a ref, so a parent passing a fresh arrow each render does not re-run the setup.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    // Capture phase on document, ahead of the shortcuts on window.
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // Only a click that starts and ends on the backdrop itself. One bubbling up from the
        // panel, or a text selection dragged out of it, leaves the dialog open.
        if (pressedBackdrop.current && e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panelRef}>
        <div className="modal-head">
          <h2>{title}</h2>
          <Btn tip="Close" hotkey="Esc" onClick={onClose}>
            ✕
          </Btn>
        </div>
        {children}
      </div>
    </div>
  );
}
