"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cell,
  downloadText,
  joinCells,
  loadCells,
  newId,
  readClipboard,
  saveCells,
  timestamp,
  toCheckboxes,
  writeClipboard,
} from "@/lib/markdown";
import MarkdownView from "./MarkdownView";

const SEP_KEY = "md-notebook:separators";

export default function Notebook() {
  const [cells, setCells] = useState<Cell[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [separators, setSeparators] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  // Load persisted state after mount so server and client markup match.
  useEffect(() => {
    setCells(loadCells());
    setSeparators(localStorage.getItem(SEP_KEY) !== "0");
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveCells(cells);
  }, [cells, loaded]);

  useEffect(() => {
    if (loaded) localStorage.setItem(SEP_KEY, separators ? "1" : "0");
  }, [separators, loaded]);

  const appendCell = useCallback((text: string) => {
    const cell: Cell = { id: newId(), text };
    setCells((prev) => [...prev, cell]);
    setEditingId(cell.id);
    return cell.id;
  }, []);

  const newFromClipboard = useCallback(async () => {
    let text = "";
    let failure: string | null = null;
    try {
      text = await readClipboard();
    } catch {
      failure = "Clipboard read was blocked — press Ctrl+V to paste into the new entry.";
    }
    appendCell(text);
    if (failure) say(failure);
    else if (!text.trim()) say("Clipboard was empty — new entry is blank.");
  }, [appendCell, say]);

  const update = useCallback((id: string, text: string) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, text } : c)));
  }, []);

  const remove = useCallback((id: string) => {
    setCells((prev) => prev.filter((c) => c.id !== id));
    setEditingId((cur) => (cur === id ? null : cur));
  }, []);

  const move = useCallback((id: string, delta: -1 | 1) => {
    setCells((prev) => {
      const i = prev.findIndex((c) => c.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }, []);

  const checkbox = useCallback((id: string) => {
    setCells((prev) => prev.map((c) => (c.id === id ? { ...c, text: toCheckboxes(c.text) } : c)));
  }, []);

  const checkboxAll = useCallback(() => {
    setCells((prev) => prev.map((c) => ({ ...c, text: toCheckboxes(c.text) })));
  }, []);

  const copyAll = useCallback(async () => {
    const text = joinCells(cells, separators);
    if (!text.trim()) return say("Nothing to copy.");
    try {
      await writeClipboard(text);
      say(`Copied ${cells.length} ${cells.length === 1 ? "entry" : "entries"} to the clipboard.`);
    } catch {
      say("Copy failed — the browser blocked clipboard write.");
    }
  }, [cells, separators, say]);

  const exportAll = useCallback(() => {
    const text = joinCells(cells, separators);
    if (!text.trim()) return say("Nothing to export.");
    const name = `md-notebook_${timestamp()}.md`;
    downloadText(name, text);
    say(`Exported ${name}`);
  }, [cells, separators, say]);

  const clearAll = useCallback(() => {
    if (!cells.length) return;
    if (!window.confirm(`Delete all ${cells.length} entries? This cannot be undone.`)) return;
    setCells([]);
    setEditingId(null);
  }, [cells.length]);

  // Ctrl/Cmd+Shift+Enter: new empty entry from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        appendCell("");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appendCell]);

  return (
    <div className="app">
      <header className="bar">
        <span className="title">md-notebook</span>
        <button className="primary" onClick={newFromClipboard}>
          + Paste New
        </button>
        <button onClick={() => appendCell("")}>+ Empty</button>
        <button onClick={checkboxAll} disabled={!cells.length}>
          Checkbox All
        </button>
        <span className="spacer" />
        <label className="toggle">
          <input
            type="checkbox"
            checked={separators}
            onChange={(e) => setSeparators(e.target.checked)}
          />
          --- separators
        </label>
        <button onClick={copyAll} disabled={!cells.length}>
          Copy All
        </button>
        <button onClick={exportAll} disabled={!cells.length}>
          Export All
        </button>
        <button className="danger" onClick={clearAll} disabled={!cells.length}>
          Clear
        </button>
      </header>

      <p className="hint">
        Entries render on blur. Ctrl+Enter or Esc finishes an entry; Ctrl+Shift+Enter adds one.
        Everything stays in this browser&apos;s local storage.
      </p>

      {!loaded ? null : cells.length === 0 ? (
        <div className="empty-state">
          No entries yet. <strong>+ Paste New</strong> drops your clipboard into a fresh entry.
        </div>
      ) : (
        cells.map((cell, i) => (
          <CellView
            key={cell.id}
            cell={cell}
            index={i}
            total={cells.length}
            editing={editingId === cell.id}
            onEdit={() => setEditingId(cell.id)}
            onCommit={() => setEditingId((cur) => (cur === cell.id ? null : cur))}
            onChange={(text) => update(cell.id, text)}
            onCheckbox={() => checkbox(cell.id)}
            onDelete={() => remove(cell.id)}
            onMove={(d) => move(cell.id, d)}
            onCopy={async () => {
              try {
                await writeClipboard(cell.text);
                say(`Copied entry ${i + 1}.`);
              } catch {
                say("Copy failed — the browser blocked clipboard write.");
              }
            }}
          />
        ))
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

type CellViewProps = {
  cell: Cell;
  index: number;
  total: number;
  editing: boolean;
  onEdit: () => void;
  onCommit: () => void;
  onChange: (text: string) => void;
  onCheckbox: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
};

function CellView({
  cell,
  index,
  total,
  editing,
  onEdit,
  onCommit,
  onChange,
  onCheckbox,
  onCopy,
  onDelete,
  onMove,
}: CellViewProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  const autosize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(el.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    if (!editing) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    autosize();
  }, [editing, autosize]);

  useEffect(() => {
    if (editing) autosize();
  }, [cell.text, editing, autosize]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      onCommit();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: t, value } = el;
      const next = `${value.slice(0, s)}  ${value.slice(t)}`;
      onChange(next);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  // Keep focus on the textarea when a toolbar button is pressed mid-edit,
  // so the blur-to-render behavior is not triggered by the toolbar itself.
  const keepFocus = (e: React.MouseEvent) => {
    if (editing) e.preventDefault();
  };

  return (
    <section className={`cell${editing ? " editing" : ""}`}>
      <div className="cell-head">
        <span className="cell-index">[{index + 1}]</span>
        {editing ? (
          <button onMouseDown={keepFocus} onClick={onCommit}>
            Done
          </button>
        ) : (
          <button onClick={onEdit}>Edit</button>
        )}
        <button onMouseDown={keepFocus} onClick={onCheckbox} title="Prefix every line with * [ ]">
          Checkbox
        </button>
        <button onMouseDown={keepFocus} onClick={onCopy}>
          Copy
        </button>
        <span className="spacer" />
        <button onMouseDown={keepFocus} onClick={() => onMove(-1)} disabled={index === 0} title="Move up">
          ↑
        </button>
        <button
          onMouseDown={keepFocus}
          onClick={() => onMove(1)}
          disabled={index === total - 1}
          title="Move down"
        >
          ↓
        </button>
        <button className="danger" onMouseDown={keepFocus} onClick={onDelete} title="Delete entry">
          ✕
        </button>
      </div>

      <div className="cell-body">
        {editing ? (
          <textarea
            ref={ref}
            className="editor"
            value={cell.text}
            spellCheck={false}
            placeholder="Markdown here. ``` fenced code, `inline`, tables, * [ ] tasks…"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={onCommit}
          />
        ) : cell.text.trim() ? (
          <MarkdownView text={cell.text} />
        ) : (
          <div className="empty-cell" onClick={onEdit}>
            (empty entry — click Edit)
          </div>
        )}
      </div>
    </section>
  );
}
