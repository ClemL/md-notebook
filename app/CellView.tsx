"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Btn from "./Btn";
import MarkdownView from "./MarkdownView";
import ImageCell from "./ImageCell";
import { Cell, formatStamp, isImageCell } from "@/lib/markdown";
import { continueListOnEnter, insertAt, isUrl, wrapSelectionAsLink } from "@/lib/editor";
import { htmlIsWorthConverting, htmlToMarkdown } from "@/lib/richPaste";
import { maybeTable } from "@/lib/table";

const COLLAPSE_PX = 420;

type Props = {
  cell: Cell;
  index: number;
  first: boolean;
  last: boolean;
  editing: boolean;
  selected: boolean;
  raw: boolean;
  richPaste: boolean;
  canMerge: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCommit: () => void;
  onChange: (text: string) => void;
  onCheckbox: () => void;
  onToggleTask: (line: number) => void;
  onCopy: () => void;
  onSend: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onToggleRaw: () => void;
  onSplit: (caret: number) => void;
  onMerge: () => void;
  /** True while this entry is the most recent copy target. */
  flashed: boolean;
  /** True while this entry is the most recent Send target. */
  sendFlashed: boolean;
  /** True while this entry's Send request is in flight. */
  sending: boolean;
};

export default function CellView({
  cell,
  index,
  first,
  last,
  editing,
  selected,
  raw,
  richPaste,
  canMerge,
  onSelect,
  onEdit,
  onCommit,
  onChange,
  onCheckbox,
  onToggleTask,
  onCopy,
  onSend,
  onDelete,
  onMove,
  onToggleRaw,
  onSplit,
  onMerge,
  flashed,
  sendFlashed,
  sending,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);

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

  // Long rendered entries are clamped so one big paste cannot bury everything after it.
  useEffect(() => {
    if (editing) return;
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight > COLLAPSE_PX + 40);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [editing, raw, cell.text]);

  useEffect(() => setExpanded(false), [cell.id]);

  /**
   * Write the new value and caret to the DOM before telling React, so the caret cannot be
   * clobbered by a later frame — a deferred setSelectionRange loses races against fast typing.
   * React then re-renders with a value the textarea already has and leaves the selection alone.
   */
  const applyEdit = (
    el: HTMLTextAreaElement,
    result: { text: string; caret: number } | null,
  ) => {
    if (!result) return false;
    el.value = result.text;
    el.setSelectionRange(result.caret, result.caret);
    onChange(result.text);
    return true;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "Escape" || (mod && e.key === "Enter" && !e.shiftKey)) {
      e.preventDefault();
      e.stopPropagation();
      onCommit();
      return;
    }
    // Ctrl+Shift+- splits the entry at the caret, as in a notebook.
    if (mod && e.shiftKey && (e.key === "-" || e.key === "_")) {
      e.preventDefault();
      e.stopPropagation();
      onSplit(el.selectionStart);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !mod && el.selectionStart === el.selectionEnd) {
      if (applyEdit(el, continueListOnEnter(el.value, el.selectionStart))) e.preventDefault();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      applyEdit(el, insertAt(el.value, el.selectionStart, el.selectionEnd, "  "));
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");

    // A URL pasted over selected text becomes a markdown link around that text.
    if (start !== end && isUrl(plain)) {
      e.preventDefault();
      applyEdit(el, wrapSelectionAsLink(el.value, start, end, plain));
      return;
    }

    // Tabular text — an Excel grid, a query result, pipe rows missing their delimiter row —
    // becomes a real markdown table, which is what makes it render as one.
    if (!html || !htmlIsWorthConverting(html, plain)) {
      const table = maybeTable(plain);
      if (table) {
        e.preventDefault();
        applyEdit(el, insertAt(el.value, start, end, table));
        return;
      }
    }

    // Rich paste: replace an HTML clipboard flavor with its markdown equivalent.
    if (!richPaste || !html || !htmlIsWorthConverting(html, plain)) return;
    e.preventDefault();
    const source = el.value;
    void htmlToMarkdown(html).then((md) => {
      applyEdit(el, insertAt(source, start, end, md ?? plain));
      el.focus();
    });
  };

  // Keep focus on the textarea when a toolbar button is pressed mid-edit,
  // so the blur-to-render behavior is not triggered by the toolbar itself.
  const keepFocus = (e: React.MouseEvent) => {
    if (editing) e.preventDefault();
  };

  const clamped = !editing && overflowing && !expanded;

  if (isImageCell(cell)) {
    return (
      <ImageCell
        cell={cell}
        index={index}
        selected={selected}
        flashed={flashed}
        onSelect={onSelect}
        onCopy={onCopy}
        onDelete={onDelete}
      />
    );
  }

  return (
    <section
      id={`cell-${cell.id}`}
      className={`cell${editing ? " editing" : ""}${selected ? " selected" : ""}`}
      onMouseDown={onSelect}
    >
      <div className="cell-head">
        <span className="cell-index">[{index + 1}]</span>
        {editing ? (
          <Btn tip="Render this entry" hotkey="Esc" onMouseDown={keepFocus} onClick={onCommit}>
            Done
          </Btn>
        ) : (
          <Btn tip="Edit this entry" hotkey="Enter" onClick={onEdit}>
            Edit
          </Btn>
        )}
        <Btn
          tip="Prefix every line with * [ ]"
          hotkey="t"
          onMouseDown={keepFocus}
          onClick={onCheckbox}
        >
          Checkbox
        </Btn>
        <Btn
          tip="Copy this entry's markdown"
          hotkey="c"
          flash={flashed}
          onMouseDown={keepFocus}
          onClick={onCopy}
        >
          Copy
        </Btn>
        <Btn
          tip="Send this entry to another machine — returns a one-time code"
          hotkey="s"
          flash={sendFlashed}
          disabled={sending}
          onMouseDown={keepFocus}
          onClick={onSend}
        >
          {sending ? "Sending…" : "Send"}
        </Btn>
        {editing ? (
          <Btn
            tip="Split this entry at the caret"
            hotkey="Ctrl+Shift+-"
            onMouseDown={keepFocus}
            onClick={() => onSplit(ref.current?.selectionStart ?? cell.text.length)}
          >
            Split
          </Btn>
        ) : (
          <Btn
            tip={raw ? "Show the rendered entry" : "Show the markdown source without editing"}
            hotkey="r"
            onClick={onToggleRaw}
            aria-pressed={raw}
          >
            {raw ? "Rendered" : "Raw"}
          </Btn>
        )}
        {!editing && canMerge && (
          <Btn tip="Merge this entry with the one below" hotkey="Shift+M" onClick={onMerge}>
            Merge ↓
          </Btn>
        )}
        <span className="spacer" />
        <span className="stamp" title={`Created ${formatStamp(cell.createdAt)}`}>
          {formatStamp(cell.updatedAt)}
        </span>
        <Btn
          tip="Move entry up"
          hotkey="Alt+↑"
          onMouseDown={keepFocus}
          onClick={() => onMove(-1)}
          disabled={first}
        >
          ↑
        </Btn>
        <Btn
          tip="Move entry down"
          hotkey="Alt+↓"
          onMouseDown={keepFocus}
          onClick={() => onMove(1)}
          disabled={last}
        >
          ↓
        </Btn>
        <Btn
          className="danger"
          tip="Delete this entry"
          hotkey="dd"
          onMouseDown={keepFocus}
          onClick={onDelete}
        >
          ✕
        </Btn>
      </div>

      <div className={`cell-body${clamped ? " clamped" : ""}`} ref={bodyRef}>
        {editing ? (
          <textarea
            ref={ref}
            className="editor"
            value={cell.text}
            spellCheck={false}
            placeholder="Markdown here. ``` fenced code, `inline`, tables, * [ ] tasks…"
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={onCommit}
          />
        ) : raw && cell.text.trim() ? (
          <pre className="raw">{cell.text}</pre>
        ) : cell.text.trim() ? (
          <MarkdownView text={cell.text} onToggleTask={onToggleTask} />
        ) : (
          <div className="empty-cell" onClick={onEdit}>
            (empty entry — click Edit)
          </div>
        )}
        {clamped && (
          <button className="expand" onClick={() => setExpanded(true)}>
            Show more
          </button>
        )}
      </div>
      {!clamped && overflowing && !editing && (
        <button className="expand collapse" onClick={() => setExpanded(false)}>
          Show less
        </button>
      )}
    </section>
  );
}
