/**
 * Copying entries as formatted text, for pasting into Outlook, Teams, Word and Wrike, where
 * markdown arrives as raw syntax.
 *
 * The markdown is rendered with the same GFM and line-break rules as the notebook. The HTML gets
 * inline styles rather than a stylesheet, because mail clients drop <style> blocks, and task
 * checkboxes become ☐ / ☑ characters, because pasted form controls are stripped. Syntax
 * highlighting is left out: its colours come from class names that mean nothing at the other end.
 * Raw HTML in the markdown is dropped, as it is on screen. The plain-text flavor is the markdown,
 * so a plain-text target still receives something readable.
 */

import type { Element, Root } from "hast";
import { toHtml } from "hast-util-to-html";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";

const processor = unified().use(remarkParse).use(remarkGfm).use(remarkBreaks).use(remarkRehype);

const MONO = "Consolas, 'Courier New', monospace";

const STYLES: Record<string, string> = {
  table: "border-collapse: collapse; margin: 6px 0;",
  th: "border: 1px solid #bfbfbf; padding: 4px 8px; background: #f2f2f2; text-align: left;",
  td: "border: 1px solid #bfbfbf; padding: 4px 8px; text-align: left;",
  pre: `font-family: ${MONO}; font-size: 10pt; background: #f6f8fa; border: 1px solid #e1e4e8; padding: 8px; white-space: pre-wrap;`,
  code: `font-family: ${MONO}; font-size: 10pt; background: #f2f2f2; padding: 0 3px;`,
  blockquote: "border-left: 3px solid #c8c8c8; margin: 6px 0; padding-left: 10px; color: #555555;",
  img: "max-width: 100%;",
};

const isElement = (node: { type: string }): node is Element => node.type === "element";

function style(el: Element, css: string) {
  const existing = typeof el.properties.style === "string" ? `${el.properties.style} ` : "";
  el.properties.style = existing + css;
}

/** Inline styles, checkbox characters, and plain code blocks, in place. */
function decorate(node: Root | Element, inPre = false) {
  node.children.forEach((child, i) => {
    if (!isElement(child)) return;
    if (child.tagName === "input" && child.properties.type === "checkbox") {
      node.children[i] = { type: "text", value: child.properties.checked ? "☑" : "☐" };
      return;
    }
    const tag = child.tagName;
    if (tag === "code" && inPre) {
      // The <pre> carries the styling; a class naming the language is of no use once pasted.
      delete child.properties.className;
    } else if (STYLES[tag]) {
      style(child, STYLES[tag]);
    }
    if (tag === "ul" && (child.properties.className as string[] | undefined)?.includes("contains-task-list")) {
      style(child, "list-style: none; padding-left: 4px;");
    }
    if (tag === "th" || tag === "td") {
      // GFM column alignment arrives as an align attribute; keep it, and mirror it in the style.
      const align = child.properties.align;
      if (typeof align === "string") style(child, `text-align: ${align};`);
    }
    decorate(child, inPre || tag === "pre");
  });
}

/** One entry's markdown as pasteable HTML. */
export function markdownToHtml(markdown: string): string {
  const tree = processor.runSync(processor.parse(markdown)) as Root;
  decorate(tree);
  return toHtml(tree);
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** An image entry as an inline <img>, sized to what the notebook stores. */
export function imageHtml(src: string, width: number, alt = "image"): string {
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" width="${Math.round(width)}" style="${STYLES.img}">`;
}

/** Several entries' HTML joined as one document, with a rule between them when separators are on. */
export function joinHtml(parts: string[], separators: boolean): string {
  const body = parts.filter((p) => p.trim()).join(separators ? "\n<hr>\n" : "\n");
  return `<div>${body}</div>`;
}

/**
 * Writes HTML and its plain-text twin to the clipboard together, so the paste target picks the
 * richest flavor it understands. Falls back to a copy event where ClipboardItem is missing.
 */
export async function writeRichClipboard(html: string, plain: string): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([html], { type: "text/html" }),
        "text/plain": new Blob([plain], { type: "text/plain" }),
      }),
    ]);
    return;
  }
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData("text/html", html);
    e.clipboardData?.setData("text/plain", plain);
    e.preventDefault();
  };
  document.addEventListener("copy", onCopy);
  try {
    if (!document.execCommand("copy")) throw new Error("Copy failed.");
  } finally {
    document.removeEventListener("copy", onCopy);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("The image could not be read."));
    reader.readAsDataURL(blob);
  });
}
