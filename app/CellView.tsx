"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Btn from "./Btn";
import MarkdownView from "./MarkdownView";
import { Cell, formatStamp } from "@/lib/markdown";
import { htmlIsWorthConverting, htmlToMarkdown } from "@/lib/richPaste";

const COLLAPSE_PX = 420;

type Props = {
  cell: Cell;
  index: number;
  first: boolean;
  last: boolean;
  editing: boolean;
  selected: boolean;
  richPaste: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCommit: () => void;
  onChange: (text: string) => void;
  onCheckbox: () => void;
  onToggleTask: (line: number) => void;
  onCopy: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
};

export default function CellView({
  cell,
  index,
  first,
  last,
  editing,
  selected,
  richPaste,
  onSelect,
  onEdit,
  onCommit,
  onChange,
  onCheckbox,
  onToggleTask,
  onCopy,
  onDelete,
  onMove,
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
  }, [editing, cell.text]);

  useEffect(() => setExpanded(false), [cell.id]);

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
      onChange(`${value.slice(0, s)}  ${value.slice(t)}`);
      requestAnimationFrame(() => el.setSelectionRange(s + 2, s + 2));
    }
  };

  // Rich paste: replace an HTML clipboard flavor with its markdown equivalent.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!richPaste) return;
    const html = e.clipboardData.getData("text/html");
    const plain = e.clipboardData.getData("text/plain");
    if (!html || !htmlIsWorthConverting(html, plain)) return;
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    void htmlToMarkdown(html).then((md) => {
      const insert = md ?? plain;
      onChange(`${before}${insert}${after}`);
      requestAnimationFrame(() => {
        const at = start + insert.length;
        el.setSelectionRange(at, at);
        el.focus();
      });
    });
  };

  // Keep focus on the textarea when a toolbar button is pressed mid-edit,
  // so the blur-to-render behavior is not triggered by the toolbar itself.
  const keepFocus = (e: React.MouseEvent) => {
    if (editing) e.preventDefault();
  };

  const clamped = !editing && overflowing && !expanded;

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
        <Btn tip="Copy this entry's markdown" hotkey="c" onMouseDown={keepFocus} onClick={onCopy}>
          Copy
        </Btn>
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
