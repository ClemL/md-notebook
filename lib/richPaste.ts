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
/**
 * The part of a line a reader sees: link labels without their targets, and a bare URL counted as
 * one word. Fragment length has to be judged on this, since a breadcrumb segment of five visible
 * characters can carry an eighty-character Azure DevOps URL behind it.
 */
export function visibleLine(line: string): string {
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<(?:https?:\/\/|mailto:)[^>]*>/gi, "url")
    .replace(/(?:https?:\/\/|mailto:)\S+/gi, "url")
    .replace(/\s+/g, " ")
    .trim();
}

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

    const visible = visibleLine(line);
    if (visible.length > 80) return false;
    const count = visible ? visible.split(" ").length : 0;
    words += count;
    // Sentence punctuation on a multi-word fragment means prose, not a breadcrumb segment.
    if (count > 3 && /[.!?:;]$/.test(visible)) return false;
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


/** Azure DevOps hosts whose URLs carry {account}/{project}/_git/{repo} in the path. */
function devOpsScope(url: string): { account?: string; project?: string; repo?: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  const legacy = host.endsWith(".visualstudio.com");
  if (host !== "dev.azure.com" && !legacy) return null;

  const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  // dev.azure.com/{account}/{project}/_git/{repo}; {account}.visualstudio.com/{project}/_git/{repo}
  const account = legacy ? host.split(".")[0] : parts.shift();
  const project = parts.shift();
  const gitAt = parts.indexOf("_git");
  const repo = gitAt >= 0 ? parts[gitAt + 1] : undefined;
  return { account, project, repo };
}

const TRAIL_SEPARATOR = /\s*(?:>|\u203a|\u00bb)\s*/;

/**
 * Azure DevOps puts the file link first and the location after it, with the project name leading:
 * "[StorageAccount.cs](url)Org > DataDownloader.SFTP". Read as a path that is backwards, and the
 * project segment is noise, so rewrite it as "DataDownloader.SFTP > [StorageAccount.cs](url)".
 * Only applies to a single Azure DevOps link followed by a ">"-separated trail.
 */
export function rewriteAzureDevOpsPath(md: string): string {
  const line = md.trim();
  if (line.includes("\n")) return md;

  const match = line.match(/^\[([^\]]+)\]\((\S+)\)\s*(.*)$/);
  if (!match) return md;
  const [, label, url, trail] = match;
  if (!trail.trim() || trail.includes("](")) return md;

  const scope = devOpsScope(url);
  if (!scope) return md;

  const noise = new Set(
    [scope.account, scope.project, label].filter(Boolean).map((v) => v!.toLowerCase()),
  );
  const segments = trail
    .split(TRAIL_SEPARATOR)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .filter((seg) => !noise.has(seg.toLowerCase()));

  const link = `[${label}](${url})`;
  return segments.length ? `${segments.join(" > ")} > ${link}` : link;
}

/**
 * A pasted string that is nothing but one URL. Azure DevOps puts branch names and file paths in
 * the query string, so internal "/" is expected; whitespace anywhere means this is prose that
 * merely contains a link, which these rules deliberately leave alone.
 */
function soleUrl(text: string): URL | null {
  const trimmed = text.trim();
  if (!trimmed || /\s/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/**
 * Reads one query parameter by name, so parameter order does not matter.
 *
 * `URLSearchParams` is not used: it applies the form-encoding rule where "+" means a space, which
 * corrupts a file path or branch name that legitimately contains one.
 */
function rawParam(url: URL, name: string): string | null {
  for (const pair of url.search.replace(/^\?/, "").split("&")) {
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if ((eq < 0 ? pair : pair.slice(0, eq)) !== name) continue;
    const value = eq < 0 ? "" : pair.slice(eq + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Last segment of a `path` query value: "/src/Model.sln" -> "Model.sln". */
function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

/**
 * The label an Azure DevOps URL should read as, or null when it is not one of the four shapes
 * this understands. Narrow by design: anything unrecognized keeps the bare URL it came as.
 *
 *   D  /{org}/{project}/_git/{repo}/pullrequest/{n}   -> "{repo} PR !{n}"
 *   C  /{org}/{project}/_git/{repo}?version=GB{branch}&path=/{file}  -> "{branch} / {file}"
 *   B  /{org}/{project}/_git/{repo}?path=/{file}      -> "{file}"
 *   A  /{org}/{project}/_wiki/wikis/{wiki}/{id}/{page} -> "{page}"
 *
 * `version` values other than a `GB` (git branch) prefix — `GT` tags, `GC` commits — are out of
 * scope and left unrewritten rather than guessed at.
 */
export function azureDevOpsUrlLabel(raw: string): string | null {
  const url = soleUrl(raw);
  if (!url || url.hostname.toLowerCase() !== "dev.azure.com") return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const gitAt = parts.indexOf("_git");

  if (gitAt >= 0) {
    const repo = parts[gitAt + 1];
    if (!repo) return null;
    const rest = parts.slice(gitAt + 2);

    // D — a pull request, checked first: the path segment is unambiguous.
    if (rest[0] === "pullrequest" && /^\d+$/.test(rest[1] ?? "") && rest.length === 2) {
      return `${decodeSegment(repo)} PR !${rest[1]}`;
    }
    // B and C — a file in a repo, which carries no path segments past the repo name.
    if (rest.length) return null;

    const path = rawParam(url, "path");
    if (!path) return null;
    const file = basename(path);
    if (!file) return null;

    const version = rawParam(url, "version");
    if (version === null) return file;
    if (!version.startsWith("GB")) return null;
    const branch = version.slice(2);
    return branch ? `${branch} / ${file}` : file;
  }

  // A — a wiki page: /{org}/{project}/_wiki/wikis/{wiki}/{pageId}/{pageName}.
  if (parts[2] === "_wiki" && parts[3] === "wikis" && parts.length === 7 && /^\d+$/.test(parts[5])) {
    const page = decodeSegment(parts[6]);
    return page || null;
  }

  return null;
}

/**
 * Turns a pasted bare Azure DevOps URL into a markdown link that reads as what it points at.
 * Returns null when the paste is not one of the recognized shapes, so the caller leaves it alone.
 */
export function rewriteAzureDevOpsUrl(text: string): string | null {
  const label = azureDevOpsUrlLabel(text);
  return label ? `[${label}](${text.trim()})` : null;
}

/** Converts an HTML clipboard flavor to markdown; returns null when conversion is unavailable. */
export async function htmlToMarkdown(html: string): Promise<string | null> {
  const convert = await getConverter();
  if (!convert) return null;
  try {
    return rewriteAzureDevOpsPath(flattenInlineRun(tidyMarkdown(convert(html))));
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
