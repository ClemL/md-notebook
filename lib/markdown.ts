export type Cell = {
  id: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
  /** Present on an image entry; such an entry holds no markdown of its own. */
  image?: StoredImage;
};

export type Backup = {
  app: "md-notebook";
  version: 2;
  exportedAt: string;
  cells: Cell[];
};

import type { ImageView, StoredImage } from "./image";

// A view no longer offered (an earlier "height") falls back to the thumbnail.
const IMAGE_VIEWS: readonly ImageView[] = ["thumb", "width", "original"];

export const STORAGE_KEY = "md-notebook:v2";
const LEGACY_KEY = "md-notebook:v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeCell(text = "", now = Date.now()): Cell {
  return { id: newId(), text, createdAt: now, updatedAt: now };
}

export function makeImageCell(image: StoredImage, now = Date.now()): Cell {
  return { id: newId(), text: "", createdAt: now, updatedAt: now, image };
}

export function isImageCell(cell: Cell): boolean {
  return !!cell.image?.dataUrl;
}

/** What an image entry contributes to an export: a caption, never a megabyte of base64. */
export function imagePlaceholder(cell: Cell): string {
  if (!cell.image) return "";
  const when = formatStamp(cell.image.addedAt);
  return `*(image pasted ${when} — held in the notebook; use the .json backup to keep it)*`;
}

/** Prefix every non-empty line with a GFM task item marker, skipping lines that already have one. */
export function toCheckboxes(text: string): string {
  const alreadyTask = /^\s*(?:[-*+]|\d+\.)\s+\[[ xX]\]\s/;
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      if (alreadyTask.test(line)) return line;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const body = line.slice(indent.length).replace(/^(?:[-*+]|\d+\.)\s+/, "");
      return `${indent}* [ ] ${body}`;
    })
    .join("\n");
}

/** The line formats the ☑️ button steps through, in order; "plain" wraps back to "task". */
export const LINE_FORMATS = ["task", "numbered", "bullet", "code", "plain"] as const;
export type LineFormat = (typeof LINE_FORMATS)[number];

const TASK_LINE = /^(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s+/;
const NUMBERED_LINE = /^\d+[.)]\s+/;
const BULLET_LINE = /^[-*+]\s+/;
const CODE_LINE = /^(`+)\s?(.*?)\s?\1$/;

function lineFormat(body: string): LineFormat {
  if (TASK_LINE.test(body)) return "task";
  if (NUMBERED_LINE.test(body)) return "numbered";
  if (BULLET_LINE.test(body)) return "bullet";
  if (CODE_LINE.test(body)) return "code";
  return "plain";
}

/** The format every non-empty line shares, or "plain" when they differ. */
export function currentLineFormat(text: string): LineFormat {
  const formats = new Set(
    text
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => lineFormat(l.trimStart())),
  );
  return formats.size === 1 ? [...formats][0] : "plain";
}

function stripLineFormat(body: string): string {
  const code = body.match(CODE_LINE);
  if (code) return code[2];
  return body.replace(TASK_LINE, "").replace(NUMBERED_LINE, "").replace(BULLET_LINE, "");
}

/** Inline code that survives backticks in the text by using a longer fence. */
function asInlineCode(body: string): string {
  const longest = Math.max(0, ...(body.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return longest ? `${fence} ${body} ${fence}` : `${fence}${body}${fence}`;
}

/**
 * Rewrite every non-empty line in one format. Numbering restarts per indent level, so a nested
 * list counts from 1 under each parent.
 */
export function applyLineFormat(text: string, format: LineFormat): string {
  const counters = new Map<number, number>();
  return text
    .split("\n")
    .map((line) => {
      if (line.trim() === "") return line;
      const indent = line.match(/^\s*/)?.[0] ?? "";
      const body = stripLineFormat(line.slice(indent.length));
      for (const depth of [...counters.keys()]) if (depth > indent.length) counters.delete(depth);
      switch (format) {
        case "task":
          return `${indent}* [ ] ${body}`;
        case "numbered": {
          const n = (counters.get(indent.length) ?? 0) + 1;
          counters.set(indent.length, n);
          return `${indent}${n}. ${body}`;
        }
        case "bullet":
          return `${indent}- ${body}`;
        case "code":
          return `${indent}${asInlineCode(body)}`;
        default:
          return `${indent}${body}`;
      }
    })
    .join("\n");
}

/**
 * The ☑️ button: text that is not yet a task list becomes one (keeping any items already
 * ticked); a task list moves on to numbered, then bullets, then inline code, then plain text.
 */
export function cycleLineFormat(text: string): string {
  const current = currentLineFormat(text);
  if (current === "plain") {
    // toCheckboxes keeps items that are already tasks, ticked or not, in a mixed entry.
    const tasks = toCheckboxes(text);
    if (tasks !== text) return tasks;
  }
  const next = LINE_FORMATS[(LINE_FORMATS.indexOf(current) + 1) % LINE_FORMATS.length];
  return applyLineFormat(text, next);
}

/**
 * Flip the task marker on a 1-based source line, used when a rendered checkbox is clicked.
 * Returns the text unchanged when that line holds no task marker.
 */
export function toggleTaskAtLine(text: string, line: number): string {
  const lines = text.split("\n");
  const i = line - 1;
  if (i < 0 || i >= lines.length) return text;
  const marker = /^(\s*(?:[-*+]|\d+\.)\s+\[)([ xX])(\])/;
  const m = lines[i].match(marker);
  if (!m) return text;
  lines[i] = lines[i].replace(marker, `$1${m[2] === " " ? "x" : " "}$3`);
  return lines.join("\n");
}

/** yyyyMMdd_HHmm in local time, matching the export-filename convention. */
export function timestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

/** yyyy-MM-dd HH:mm for the per-entry stamp in the cell header. */
export function formatStamp(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * File name for one entry downloaded on its own: the size label from the cell header, then its
 * stamp, both made filename-safe — "4×3_2026-10-07_14-40.md", "12-lines_2026-10-07_14-40.md".
 */
export function cellFileName(meta: string, ms: number, ext = "md"): string {
  const stamp = formatStamp(ms).replace(" ", "_").replace(":", "-");
  return `${meta.trim().replace(/\s+/g, "-")}_${stamp}.${ext}`;
}

export function joinCells(cells: Cell[], separators: boolean): string {
  const bodies = cells
    .map((c) => (isImageCell(c) ? imagePlaceholder(c) : c.text.trim()))
    .filter((t) => t.length > 0);
  return bodies.join(separators ? "\n\n---\n\n" : "\n\n") + (bodies.length ? "\n" : "");
}

/** Split an imported markdown file on thematic-break lines into one cell per chunk. */
export function splitMarkdown(md: string, now = Date.now()): Cell[] {
  const chunks: string[] = [];
  let buf: string[] = [];
  let fence: string | null = null;
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const fenceMatch = line.match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1][0];
      else if (fenceMatch[1][0] === fence) fence = null;
    }
    if (!fence && /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line) && buf.join("").trim()) {
      chunks.push(buf.join("\n"));
      buf = [];
      continue;
    }
    buf.push(line);
  }
  if (buf.join("").trim()) chunks.push(buf.join("\n"));
  return chunks.map((c) => makeCell(c.trim(), now)).filter((c) => c.text.length > 0);
}

export function searchableText(cell: Cell): string {
  if (isImageCell(cell)) {
    const img = cell.image!;
    return `image ${img.name ?? ""} ${formatStamp(img.addedAt)}`;
  }
  return cell.text;
}

export function matchesQuery(cell: Cell, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = searchableText(cell).toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

function normalizeCells(input: unknown): Cell[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  return input
    .filter((c): c is Partial<Cell> => !!c && typeof c === "object" && typeof (c as Cell).text === "string")
    .map((c) => {
      const cell: Cell = {
        id: typeof c.id === "string" ? c.id : newId(),
        text: c.text as string,
        createdAt: typeof c.createdAt === "number" ? c.createdAt : now,
        updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now,
      };
      const image = c.image;
      if (image && typeof image.dataUrl === "string" && image.dataUrl.startsWith("data:image/")) {
        cell.image = {
          dataUrl: image.dataUrl,
          width: Number(image.width) || 0,
          height: Number(image.height) || 0,
          bytes: Number(image.bytes) || image.dataUrl.length,
          addedAt: Number(image.addedAt) || cell.createdAt,
          name: typeof image.name === "string" ? image.name : undefined,
          annotations: Array.isArray(image.annotations) ? image.annotations : undefined,
          view: IMAGE_VIEWS.includes(image.view as ImageView) ? (image.view as ImageView) : undefined,
        };
      }
      return cell;
    });
}

export function parseStored(raw: string | null): Cell[] {
  if (!raw) return [];
  try {
    return normalizeCells(JSON.parse(raw));
  } catch {
    return [];
  }
}

/** Reads v2 storage, migrating a v1 payload (no timestamps) on first run. */
export function loadCells(): Cell[] {
  try {
    const current = localStorage.getItem(STORAGE_KEY);
    if (current) return parseStored(current);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = parseStored(legacy);
      if (migrated.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    return [];
  } catch {
    return [];
  }
}

/** Returns false when the write failed, so the caller can warn that entries are memory-only. */
export function saveCells(cells: Cell[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
    return true;
  } catch {
    return false;
  }
}

export function makeBackup(cells: Cell[]): string {
  const backup: Backup = {
    app: "md-notebook",
    version: 2,
    exportedAt: new Date().toISOString(),
    cells,
  };
  return JSON.stringify(backup, null, 2);
}

/** Accepts either a backup envelope or a bare array of cells. */
export function parseBackup(json: string): Cell[] {
  const parsed: unknown = JSON.parse(json);
  if (Array.isArray(parsed)) return normalizeCells(parsed);
  if (parsed && typeof parsed === "object" && "cells" in parsed) {
    return normalizeCells((parsed as Backup).cells);
  }
  throw new Error("Unrecognized backup file.");
}

export async function readClipboard(): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.readText) {
    throw new Error("Clipboard read is not available in this browser.");
  }
  return navigator.clipboard.readText();
}

export async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(ta);
  if (!ok) throw new Error("Copy failed.");
}

/** Appends a section to accumulated clipboard text, with a "---" rule between sections. */
export function appendSection(existing: string, text: string): string {
  const head = existing.trimEnd();
  const tail = text.trim();
  return head ? `${head}\n\n---\n\n${tail}\n` : `${tail}\n`;
}

/**
 * Appends text to whatever the clipboard holds, so several entries can be gathered and pasted
 * as one report. When the browser will not let the page read the clipboard, the last text this
 * function wrote stands in for it.
 */
let lastAppended = "";
export async function appendToClipboard(text: string): Promise<void> {
  let existing = lastAppended;
  try {
    existing = (await navigator.clipboard.readText()) ?? "";
  } catch {
    // Read denied or unsupported: keep building on what was appended here.
  }
  const next = appendSection(existing, text);
  await writeClipboard(next);
  lastAppended = next;
}

export function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
