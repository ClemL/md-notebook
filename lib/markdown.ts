export type Cell = {
  id: string;
  text: string;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
};

export type Backup = {
  app: "md-notebook";
  version: 2;
  exportedAt: string;
  cells: Cell[];
};

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

export function joinCells(cells: Cell[], separators: boolean): string {
  const bodies = cells.map((c) => c.text.trim()).filter((t) => t.length > 0);
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

export function matchesQuery(cell: Cell, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every((term) => cell.text.toLowerCase().includes(term));
}

function normalizeCells(input: unknown): Cell[] {
  if (!Array.isArray(input)) return [];
  const now = Date.now();
  return input
    .filter((c): c is Partial<Cell> => !!c && typeof c === "object" && typeof (c as Cell).text === "string")
    .map((c) => ({
      id: typeof c.id === "string" ? c.id : newId(),
      text: c.text as string,
      createdAt: typeof c.createdAt === "number" ? c.createdAt : now,
      updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : now,
    }));
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

export function downloadText(filename: string, text: string, mime = "text/markdown"): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
