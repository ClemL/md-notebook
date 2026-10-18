import { isImageCell, type Cell } from "./markdown";

/** An action the command palette can run. Disabled commands are listed but cannot be run. */
export type Command = {
  id: string;
  label: string;
  /** Section shown beside the label and matched by the filter: "Entry", "Table", "Notebook"… */
  group: string;
  /** An emoji or symbol shown before the label; decorative, so it is not matched. */
  icon?: string;
  hotkey?: string;
  disabled?: boolean;
  run: () => void;
};

/**
 * Commands matching every whitespace-separated term of the query, in group or label. Those whose
 * label starts with the query come first; otherwise the registration order is kept, which puts
 * the commonest actions near the top.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const terms = q.split(/\s+/);
  const hits = commands.filter((c) => {
    const hay = `${c.group} ${c.label}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const leading = hits.filter((c) => c.label.toLowerCase().startsWith(q));
  return [...leading, ...hits.filter((c) => !leading.includes(c))];
}

const SNIPPET = 80;

/**
 * One line of an entry for the palette's search results: the first line holding the first search
 * term, or else the first non-empty line, without its heading, quote or list marker, and cut to
 * about 80 characters around the match.
 */
export function entrySnippet(cell: Cell, query: string): string {
  if (isImageCell(cell)) {
    const img = cell.image!;
    return `${img.name ?? "Image"} · ${img.width}×${img.height}`;
  }
  const lines = cell.text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "(empty entry)";
  const term = query.trim().toLowerCase().split(/\s+/)[0];
  const line = (term && lines.find((l) => l.toLowerCase().includes(term))) || lines[0];
  const clean = line.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, "") || line;
  if (clean.length <= SNIPPET) return clean;
  const at = term ? clean.toLowerCase().indexOf(term) : -1;
  const start = at > 20 ? Math.min(at - 20, clean.length - SNIPPET) : 0;
  const end = start + SNIPPET;
  return `${start > 0 ? "…" : ""}${clean.slice(start, end)}${end < clean.length ? "…" : ""}`;
}
