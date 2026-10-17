"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type Command } from "@/lib/commands";

/**
 * A searchable list of every action, so none of the shortcuts has to be memorized. Type to
 * filter, ↑/↓ to choose, Enter to run, Esc to close. Opened with `p` in command mode or
 * Ctrl+Shift+P anywhere.
 */
export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const shown = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => inputRef.current?.focus(), []);
  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const run = (cmd: Command | undefined) => {
    if (!cmd || cmd.disabled) return;
    onClose();
    // After the palette is gone, so a command that moves focus (search, edit) keeps it.
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
          placeholder="Type a command…"
          aria-label="Search commands"
          aria-controls="palette-list"
          aria-activedescendant={shown[active] ? `cmd-${shown[active].id}` : undefined}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <ul id="palette-list" ref={listRef} role="listbox" aria-label="Commands">
          {shown.length === 0 && <li className="palette-empty">No command matches.</li>}
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
              <span className="palette-label">{cmd.label}</span>
              {cmd.hotkey && <kbd>{cmd.hotkey}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
