"use client";

import Markdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

/** Renders a cell's markdown: GFM (tables, task lists, strikethrough, autolinks),
 *  single-newline line breaks, and syntax-highlighted fenced code. Raw HTML is not
 *  rendered, so pasted content cannot inject markup. */
export default function MarkdownView({ text }: { text: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
