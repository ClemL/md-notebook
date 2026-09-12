export type Cell = {
  id: string;
  text: string;
};

export const STORAGE_KEY = "md-notebook:v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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

/** yyyyMMdd_HHmm in local time, matching the export-filename convention. */
export function timestamp(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

export function joinCells(cells: Cell[], separators: boolean): string {
  const bodies = cells.map((c) => c.text.trim()).filter((t) => t.length > 0);
  return bodies.join(separators ? "\n\n---\n\n" : "\n\n") + (bodies.length ? "\n" : "");
}

export function loadCells(): Cell[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((c): c is Cell => !!c && typeof c === "object" && typeof (c as Cell).text === "string")
      .map((c) => ({ id: typeof c.id === "string" ? c.id : newId(), text: c.text }));
  } catch {
    return [];
  }
}

export function saveCells(cells: Cell[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cells));
  } catch {
    /* quota exceeded or storage disabled — scratchpad keeps working in memory */
  }
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

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
