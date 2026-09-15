/**
 * Turning tabular clipboard content into markdown tables. Markdown tables render fine already;
 * what does not is text that only looks tabular — a grid copied out of Excel or a query result,
 * and pipe rows written without the delimiter row GFM requires.
 */

const escapeCell = (value: string) => value.trim().replace(/\|/g, "\\|").replace(/\s+/g, " ");

export function rowsToMarkdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((r) => r.length));
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => escapeCell(row[i] ?? ""));
  const [header, ...body] = rows;
  const lines = [
    `| ${pad(header).join(" | ")} |`,
    `| ${Array.from({ length: width }, () => "---").join(" | ")} |`,
    ...body.map((row) => `| ${pad(row).join(" | ")} |`),
  ];
  return lines.join("\n");
}

/** Tab-separated text, as Excel, Teams and query-result grids put on the clipboard. */
export function parseDelimited(text: string): string[][] | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  if (!lines.every((l) => l.includes("\t"))) return null;

  const rows = lines.map((l) => l.split("\t"));
  const width = rows[0].length;
  if (width < 2) return null;
  // A ragged grid is more likely prose containing tabs than a table.
  if (rows.some((r) => Math.abs(r.length - width) > 1)) return null;
  return rows;
}

/** Split a pipe-delimited row, ignoring the optional leading and trailing pipes. */
function splitPipes(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/);
}

const DELIMITER_ROW = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/**
 * Pipe rows with no delimiter row are not a GFM table and render as literal text.
 * Insert the delimiter row when every line has the same number of cells.
 */
export function repairPipeTable(text: string): string | null {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  if (!lines.every((l) => l.includes("|"))) return null;
  if (lines.some((l) => DELIMITER_ROW.test(l))) return null;

  const rows = lines.map(splitPipes);
  const width = rows[0].length;
  if (width < 2 || rows.some((r) => r.length !== width)) return null;
  return rowsToMarkdownTable(rows);
}

/** Markdown table for tabular text, or null when the text is not tabular. */
export function maybeTable(text: string): string | null {
  const delimited = parseDelimited(text);
  if (delimited) return rowsToMarkdownTable(delimited);
  return repairPipeTable(text);
}

/** An empty table skeleton: a header row plus `rows` body rows, each `cols` wide. */
export function blankTable(cols: number, rows: number): string {
  const header = Array.from({ length: cols }, (_, i) => `Column ${String.fromCharCode(65 + i)}`);
  const body = Array.from({ length: rows }, () => Array.from({ length: cols }, () => " "));
  return `${rowsToMarkdownTable([header, ...body])}\n`;
}
