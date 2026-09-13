/**
 * Clipboard HTML -> markdown. Turndown is loaded on demand so it stays out of the
 * initial bundle; the notebook works without it if the import fails.
 */

let converterPromise: Promise<((html: string) => string) | null> | null = null;

async function getConverter(): Promise<((html: string) => string) | null> {
  if (!converterPromise) {
    converterPromise = (async () => {
      try {
        const [{ default: TurndownService }, gfm] = await Promise.all([
          import("turndown"),
          import("@joplin/turndown-plugin-gfm"),
        ]);
        const service = new TurndownService({
          headingStyle: "atx",
          hr: "---",
          bulletListMarker: "-",
          codeBlockStyle: "fenced",
          fence: "```",
          emDelimiter: "_",
          strongDelimiter: "**",
          linkStyle: "inlined",
        });
        service.use(gfm.gfm);
        // Office and web apps wrap everything in styling elements that carry no meaning.
        service.remove(["style", "script", "meta", "link"]);
        return (html: string) => service.turndown(html);
      } catch {
        return null;
      }
    })();
  }
  return converterPromise;
}

/** Visible text of an HTML fragment, with whitespace collapsed, for comparison against text/plain. */
function visibleText(html: string): string {
  if (typeof document === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("style,script,meta,link").forEach((el) => el.remove());
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

/**
 * True when the HTML flavor carries structure worth converting. Editors such as VS Code put a
 * syntax-colored copy of the same characters on the clipboard; converting that only adds noise,
 * so fall back to text/plain when the HTML has no block or inline markdown-mappable structure.
 */
export function htmlIsWorthConverting(html: string, plain: string): boolean {
  if (!html.trim()) return false;
  const structural =
    /<(h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|blockquote|pre|code|a\s|img|strong|b>|em|i>|del|s>|hr)/i;
  if (!structural.test(html)) return false;
  if (!plain.trim()) return true;
  // Identical visible text plus no structure beyond inline styling => nothing to gain.
  return visibleText(html) !== plain.replace(/\s+/g, " ").trim() || /<(h[1-6]|ul|ol|li|table|blockquote|pre|a\s|img)/i.test(html);
}

export function tidyMarkdown(md: string): string {
  return tightenLinks(md)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Turndown puts block wrappers inside a link on their own lines, so an anchor containing a <div>
 * arrives as "[\n\nBoards\n\n](url)". Markdown link syntax gives that whitespace no meaning,
 * so collapse it back into "[Boards](url)".
 */
export function tightenLinks(md: string): string {
  return md.replace(
    /\[[ \t\n]*([^\]]{0,300}?)[ \t\n]*\][ \t\n]*\([ \t\n]*(\S{0,2000}?)[ \t\n]*\)/g,
    (whole: string, label: string, target: string) => {
      const text = label.replace(/\s+/g, " ").trim();
      const url = target.replace(/\s+/g, "").trim();
      return url ? `[${text}](${url})` : whole;
    },
  );
}

/** A line that only separates breadcrumb segments, e.g. "/", "\>", "|", "\u203a". */
const SEPARATOR_LINE = /^\\?[/>|\u203a\u00bb\u00b7\u2014\u2013-]$/;

/** Block-level markdown, meaning the paste is a document rather than a run of inline content. */
const BLOCK_LINE = /^(?:#{1,6}\s|>\s|```|~~~|\||\s{4}|(?:[-*+]|\d+[.)])\s)/;

/**
 * True for a paste that is really one line of inline content, which Turndown split across lines
 * because the source wrapped each fragment in a block element — a breadcrumb or link trail.
 * Deliberately narrow: several short fragments, at least one link, and nothing that reads as prose.
 */
export function isInlineRun(md: string): boolean {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2 || lines.length > 40) return false;
  if (!/\]\(\S+\)/.test(tightenLinks(md))) return false;

  let words = 0;
  for (const line of lines) {
    if (SEPARATOR_LINE.test(line)) continue;
    if (BLOCK_LINE.test(line)) return false;
    if (line.length > 80) return false;
    const count = line.split(/\s+/).length;
    words += count;
    // Sentence punctuation on a multi-word fragment means prose, not a breadcrumb segment.
    if (count > 3 && /[.!?:;]$/.test(line.replace(/\)$/, ""))) return false;
  }
  return words <= 80;
}

/**
 * Collapse an inline run onto a single line: "/ [Boards](url) / [Sprints](url)".
 * Returns the input unchanged when it is not an inline run.
 */
export function flattenInlineRun(md: string): string {
  if (!isInlineRun(md)) return md;
  return tightenLinks(md)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Converts an HTML clipboard flavor to markdown; returns null when conversion is unavailable. */
export async function htmlToMarkdown(html: string): Promise<string | null> {
  const convert = await getConverter();
  if (!convert) return null;
  try {
    return flattenInlineRun(tidyMarkdown(convert(html)));
  } catch {
    return null;
  }
}

export type ClipboardPayload = { text: string; rich: boolean };

/** Reads the clipboard, preferring a converted text/html flavor when rich paste is enabled. */
export async function readClipboardSmart(rich: boolean): Promise<ClipboardPayload> {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (!nav?.clipboard) throw new Error("Clipboard is not available in this browser.");

  if (rich && nav.clipboard.read) {
    try {
      const items = await nav.clipboard.read();
      for (const item of items) {
        if (!item.types.includes("text/html")) continue;
        const html = await (await item.getType("text/html")).text();
        const plain = item.types.includes("text/plain")
          ? await (await item.getType("text/plain")).text()
          : "";
        if (htmlIsWorthConverting(html, plain)) {
          const md = await htmlToMarkdown(html);
          if (md) return { text: md, rich: true };
        }
        if (plain) return { text: plain, rich: false };
      }
    } catch {
      // Permission denied or an unsupported flavor: fall through to plain text.
    }
  }

  if (!nav.clipboard.readText) throw new Error("Clipboard read is not available in this browser.");
  return { text: await nav.clipboard.readText(), rich: false };
}
