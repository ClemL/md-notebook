"use client";

import { useCallback, useRef, useState } from "react";
import type { Element, Root } from "hast";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { writeClipboard } from "@/lib/markdown";

/** Renders a cell's markdown: GFM (tables, task lists, strikethrough, autolinks),
 *  single-newline line breaks, and syntax-highlighted fenced code. Raw HTML is not
 *  rendered, so pasted content cannot inject markup. */
/** Sort and column-delete controls for an entry that is a single markdown table. */
export type TableTools = {
  sorted: { col: number; dir: "asc" | "desc" } | null;
  canDelete: boolean;
  onSort: (col: number) => void;
  onDeleteColumn: (col: number) => void;
};

export default function MarkdownView({
  text,
  onToggleTask,
  tableTools,
}: {
  text: string;
  /** Receives the 1-based source line of a clicked task item. */
  onToggleTask?: (line: number) => void;
  tableTools?: TableTools;
}) {
  const components: Components = {
    th: ({ children, node, ...props }) => {
      const col = Number(node?.properties?.dataCol);
      if (!tableTools || !Number.isInteger(col)) return <th {...props}>{children}</th>;
      const sorted = tableTools.sorted?.col === col ? tableTools.sorted.dir : null;
      return (
        <th {...props} aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}>
          <span className="th-tools">
            <span className="th-label">{children}</span>
            <button
              type="button"
              className={`th-btn${sorted ? " on" : ""}`}
              onClick={() => tableTools.onSort(col)}
              aria-label={`Sort by column ${col + 1}${sorted === "asc" ? ", descending" : ""}`}
              title={sorted === "asc" ? "Sort descending" : "Sort ascending"}
            >
              {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : "↕"}
            </button>
            {tableTools.canDelete && (
              <button
                type="button"
                className="th-btn danger"
                onClick={() => tableTools.onDeleteColumn(col)}
                aria-label={`Delete column ${col + 1}`}
                title="Delete this column"
              >
                ✕
              </button>
            )}
          </span>
        </th>
      );
    },
    a: ({ children, ...props }) => (
      <a {...props} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
    // remark-gfm emits a disabled checkbox for task items; the <li> override renders a live one.
    input: () => null,
    li: ({ children, node, className, ...props }) => {
      const checked = taskState(node);
      const line = node?.position?.start.line;
      if (checked === null || line === undefined) {
        return (
          <li className={className} {...props}>
            {children}
          </li>
        );
      }
      return (
        <li className={`${className ?? ""} task`.trim()} {...props}>
          <input
            type="checkbox"
            checked={checked}
            disabled={!onToggleTask}
            onChange={() => onToggleTask?.(line)}
            aria-label="Toggle task"
          />
          {children}
        </li>
      );
    },
  };

  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeColumnIndex, [rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
}

/** Tags each table cell with its column number, which a header cell's controls act on. */
function rehypeColumnIndex() {
  const walk = (node: Root | Element) => {
    for (const child of node.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "tr") {
        child.children
          .filter((c): c is Element => c.type === "element" && (c.tagName === "th" || c.tagName === "td"))
          .forEach((c, i) => {
            c.properties = { ...c.properties, dataCol: i };
          });
      } else {
        walk(child);
      }
    }
  };
  return (tree: Root) => walk(tree);
}

/**
 * A GFM task item renders as an <li class="task-list-item"> holding a disabled checkbox: a direct
 * child in a tight list, or wrapped in a <p> in a loose one (items separated by blank lines).
 * The checked state lives on that input; the source line lives on the <li>.
 */
function findTaskInput(node: Element, depth = 0): Element | null {
  for (const child of node.children) {
    if (child.type !== "element") continue;
    if (child.tagName === "input" && child.properties?.type === "checkbox") return child;
    // Do not descend into a nested list, whose checkboxes belong to their own items.
    if (child.tagName === "ul" || child.tagName === "ol" || depth >= 2) continue;
    const found = findTaskInput(child, depth + 1);
    if (found) return found;
  }
  return null;
}

function taskState(node: Element | undefined): boolean | null {
  if (!node) return null;
  const input = findTaskInput(node);
  if (!input) return null;
  const checked = input.properties?.checked;
  return typeof checked === "boolean" ? checked : checked === "" || checked === "checked";
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    const code = ref.current?.querySelector("code")?.textContent ?? "";
    if (!code) return;
    try {
      await writeClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard write blocked; nothing useful to show inside the block */
    }
  }, []);

  return (
    <div className="codeblock">
      <pre ref={ref}>{children}</pre>
      <button className="codecopy" onClick={copy} aria-label="Copy code block" type="button">
        {copied ? "copied" : "copy"}
      </button>
    </div>
  );
}
