"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Marks the button whose copy or export ran most recently. Exactly one button is marked at a time,
 * so the highlight also answers "what did I last copy?" until the next copy replaces it.
 *
 * Appends are tracked apart from that: each +📋 adds its entry to what the clipboard holds, so
 * every entry appended stays marked until a copy replaces the clipboard outright.
 */
type FlashState = {
  flashed: string | null;
  appended: ReadonlySet<string>;
  /** `clipboard` is true when the action overwrote the clipboard, which ends the append run. */
  flash: (id: string, opts?: { clipboard?: boolean }) => void;
  markAppended: (id: string) => void;
};

const NONE: ReadonlySet<string> = new Set();

const FlashContext = createContext<FlashState>({
  flashed: null,
  appended: NONE,
  flash: () => {},
  markAppended: () => {},
});

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flashed, setFlashed] = useState<string | null>(null);
  const [appended, setAppended] = useState<ReadonlySet<string>>(NONE);
  const flash = useCallback((id: string, opts?: { clipboard?: boolean }) => {
    setFlashed(id);
    if (opts?.clipboard) setAppended(NONE);
  }, []);
  const markAppended = useCallback(
    (id: string) => setAppended((prev) => (prev.has(id) ? prev : new Set(prev).add(id))),
    [],
  );
  const value = useMemo(
    () => ({ flashed, appended, flash, markAppended }),
    [flashed, appended, flash, markAppended],
  );
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlash() {
  return useContext(FlashContext);
}

/** Props to spread onto a button so it renders as the active copy/export target. */
export function flashProps(flashed: string | null, id: string) {
  return flashed === id ? { "data-flash": "on" as const } : {};
}
