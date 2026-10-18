"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@/lib/commands";

/**
 * The notebook's main control: one box that runs any action and finds any entry, so none of the
 * shortcuts has to be memorized. Type to filter, ↑/↓ to choose, Enter to run, Esc to close.
 * Matching commands come first, then whatever `search` returns for the query — the matching
 * entries. Opened from the header, with `p` or `/` in command mode, or Ctrl+K / Ctrl+Shift+P
 * anywhere.
 */
export default function CommandPalette({
  commands,
  search,
  initialQuery = "",
  onClose,
}: {
  commands: Command[];
  /** Extra results for a non-empty query, listed after the commands. */
  search?: (query: string) => Command[];
  /** Pre-filled and selected, so typing replaces it. */
  initialQuery?: string;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const shown = useMemo(
    () => [...filterCommands(commands, query), ...(search && query.trim() ? search(query) : [])],
    [commands, search, query],
  );

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (cmd: Command | undefined) => {
    if (!cmd || cmd.disabled) return;
    onClose();
    // After the palette is gone, so a command that moves focus (edit, jump) keeps it.
    requestAnimationFrame(() => cmd.run());
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = shown.length;
      if (n) setActive((i) => (i + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      run(shown[active]);
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search entries or type a command…"
          aria-label="Search entries and commands"
          aria-controls="palette-list"
          aria-activedescendant={shown[active] ? `cmd-${shown[active].id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="Commands and entries">
          {shown.length === 0 && <li className="palette-empty">No command or entry matches.</li>}
          {shown.map((cmd, i) => (
            <li
              key={cmd.id}
              id={`cmd-${cmd.id}`}
              data-index={i}
              role="option"
              aria-selected={i === active}
              aria-disabled={cmd.disabled || undefined}
              className={i === active ? "active" : undefined}
              onMouseMove={() => setActive(i)}
              onClick={() => run(cmd)}
            >
              <span className="palette-group">{cmd.group}</span>
              <span className="palette-label">
                {cmd.icon && (
                  <span className="palette-icon" aria-hidden="true">
                    {cmd.icon}
                  </span>
                )}
                {cmd.label}
              </span>
              {cmd.hotkey && <kbd>{cmd.hotkey}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
