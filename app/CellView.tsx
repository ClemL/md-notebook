"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Btn from "./Btn";
import MarkdownView, { type TableTools } from "./MarkdownView";
import ImageCell from "./ImageCell";
import { Cell, formatStamp, isImageCell } from "@/lib/markdown";
import type { ImageView, StoredImage } from "@/lib/image";
import { continueListOnEnter, insertAt, isUrl, wrapSelectionAsLink } from "@/lib/editor";
import { htmlIsWorthConverting, htmlToMarkdown, rewriteAzureDevOpsUrl } from "@/lib/richPaste";
import { deleteTableColumn, maybeTable, parseTable, sortTable } from "@/lib/table";

const COLLAPSE_PX = 420;
/** A collapsed entry shows this many lines of its rendered output and nothing else. */
const COLLAPSED_LINES = 2;

type Props = {
  cell: Cell;
  index: number;
  first: boolean;
  last: boolean;
  editing: boolean;
  selected: boolean;
  raw: boolean;
  collapsed: boolean;
  richPaste: boolean;
  canMerge: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onCommit: () => void;
  onChange: (text: string) => void;
  onCheckbox: () => void;
  onToggleTask: (line: number) => void;
  onCopy: () => void;
  onDelete: () => void;
  onMove: (delta: -1 | 1) => void;
  onImageChange: (next: StoredImage) => void;
  onImageView: (view: ImageView) => void;
  /** A structural rewrite of the text (a table sort or column delete): one undo step. */
  onReplaceText: (text: string) => void;
  onNotify: (message: string) => void;
  onToggleRaw: () => void;
  onToggleCollapse: () => void;
  onSplit: (caret: number) => void;
  onMerge: () => void;
  /** True while this entry is the most recent copy target. */
  flashed: boolean;
};

export default function CellView({
  cell,
  index,
  first,
  last,
  editing,
  selected,
  raw,
  collapsed,
  richPaste,
  canMerge,
  onSelect,
  onEdit,
  onCommit,
  onChange,
  onCheckbox,
  onToggleTask,
  onCopy,
  onDelete,
  onMove,
  onImageChange,
  onImageView,
  onReplaceText,
  onNotify,
  onToggleRaw,
  onToggleCollapse,
  onSplit,
  onMerge,
  flashed,
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

    // A bare Azure DevOps URL on its own becomes a link labelled with what it points at:
    // the wiki page, the file, the branch and file, or the pull request.
    const adoLink = rewriteAzureDevOpsUrl(plain);
    if (adoLink) {
      e.preventDefault();
      applyEdit(el, insertAt(el.value, start, end, adoLink));
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

  const clamped = !editing && overflowing && !expanded && !collapsed;
  const lineCount = cell.text.trim() ? cell.text.trim().split("\n").length : 0;
  const hiddenLines = Math.max(0, lineCount - COLLAPSED_LINES);

  // An entry that is one markdown table and nothing else gets sort and column-delete controls.
  const parsedTable = useMemo(() => parseTable(cell.text), [cell.text]);
  const table = editing || raw ? null : parsedTable;
  // Size beside the timestamp, as image entries show dimensions: rows × columns for a table, lines otherwise.
  const meta = parsedTable
    ? `${parsedTable.rows.length}×${parsedTable.header.length}`
    : `${lineCount} ${lineCount === 1 ? "line" : "lines"}`;
  const metaTip = parsedTable
    ? `${parsedTable.rows.length} ${parsedTable.rows.length === 1 ? "row" : "rows"} × ${parsedTable.header.length} ${
        parsedTable.header.length === 1 ? "column" : "columns"
      }`
    : undefined;
  const [sorted, setSorted] = useState<TableTools["sorted"]>(null);
  // A hand edit can reorder the rows, after which the sort marker would be a claim it cannot back.
  useEffect(() => {
    if (editing) setSorted(null);
  }, [editing]);
  const tableTools: TableTools | undefined = table
    ? {
        sorted,
        canDelete: table.header.length > 1,
        onSort: (col) => {
          const dir = sorted?.col === col && sorted.dir === "asc" ? "desc" : "asc";
          const next = sortTable(cell.text, col, dir);
          if (next === null) return;
          setSorted({ col, dir });
          if (next !== cell.text) onReplaceText(next);
        },
        onDeleteColumn: (col) => {
          const next = deleteTableColumn(cell.text, col);
          if (next === null) return;
          setSorted(null);
          onReplaceText(next);
        },
      }
    : undefined;

  if (isImageCell(cell)) {
    return (
      <ImageCell
        cell={cell}
        index={index}
        first={first}
        last={last}
        canMerge={canMerge}
        selected={selected}
        flashed={flashed}
        collapsed={collapsed}
        onToggleCollapse={onToggleCollapse}
        onSelect={onSelect}
        onCopy={onCopy}
        onDelete={onDelete}
        onMove={onMove}
        onMerge={onMerge}
        onViewChange={onImageView}
        onImageChange={onImageChange}
        onNotify={onNotify}
      />
    );
  }

  return (
    <section
      id={`cell-${cell.id}`}
      className={`cell${editing ? " editing" : ""}${selected ? " selected" : ""}${
        collapsed && !editing ? " collapsed" : ""
      }`}
      onMouseDown={onSelect}
    >
      <div className="cell-head">
        <span className="cell-index">[{index + 1}]</span>
        {!editing && (
          <Btn
            className="collapse-toggle"
            tip={collapsed ? "Expand this entry" : "Collapse to the first two lines"}
            onClick={onToggleCollapse}
            aria-expanded={!collapsed}
          >
            {collapsed ? "▸" : "▾"}
          </Btn>
        )}
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
          ☑️
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
        {collapsed && hiddenLines > 0 && (
          <span className="collapsed-chip">+{hiddenLines} lines</span>
        )}
        <span className="cell-meta" title={metaTip}>
          {meta}
        </span>
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

      <div
        className={`cell-body${clamped ? " clamped" : ""}${collapsed && !editing ? " collapsed" : ""}`}
        ref={bodyRef}
        onDoubleClick={collapsed ? onToggleCollapse : undefined}
      >
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
          <MarkdownView text={cell.text} onToggleTask={onToggleTask} tableTools={tableTools} />
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
