"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Marks the button whose copy or export ran most recently. Exactly one button is marked at a time,
 * so the highlight also answers "what did I last copy?" until the next copy replaces it.
 */
type FlashState = { flashed: string | null; flash: (id: string) => void };

const FlashContext = createContext<FlashState>({ flashed: null, flash: () => {} });

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flashed, setFlashed] = useState<string | null>(null);
  const flash = useCallback((id: string) => setFlashed(id), []);
  const value = useMemo(() => ({ flashed, flash }), [flashed, flash]);
  return <FlashContext.Provider value={value}>{children}</FlashContext.Provider>;
}

export function useFlash() {
  return useContext(FlashContext);
}

/** Props to spread onto a button so it renders as the active copy/export target. */
export function flashProps(flashed: string | null, id: string) {
  return flashed === id ? { "data-flash": "on" as const } : {};
}
