"use client";

import { useCallback, useRef, useState } from "react";
import type { Element } from "hast";
import Markdown, { type Components } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { writeClipboard } from "@/lib/markdown";

/** Renders a cell's markdown: GFM (tables, task lists, strikethrough, autolinks),
 *  single-newline line breaks, and syntax-highlighted fenced code. Raw HTML is not
 *  rendered, so pasted content cannot inject markup. */
export default function MarkdownView({
  text,
  onToggleTask,
}: {
  text: string;
  /** Receives the 1-based source line of a clicked task item. */
  onToggleTask?: (line: number) => void;
}) {
  const components: Components = {
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
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {text}
      </Markdown>
    </div>
  );
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
