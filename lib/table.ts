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

/* ------------------------------------------------------ editing a table in place */

/**
 * An entry that is a markdown table and nothing else: header, delimiter row, body rows. Cells
 * are kept raw (escaped pipes and inline markdown intact) so a sort or a column delete rewrites
 * only the order and the columns, never the content.
 */
export type ParsedTable = { header: string[]; delimiter: string[]; rows: string[][] };

export function parseTable(text: string): ParsedTable | null {
  const lines = text.replace(/\r\n/g, "\n").trim().split("\n");
  if (lines.length < 2) return null;
  if (!lines.every((l) => l.trim().includes("|"))) return null;
  if (!DELIMITER_ROW.test(lines[1])) return null;

  const cells = (l: string) => splitPipes(l).map((c) => c.trim());
  const header = cells(lines[0]);
  const delimiter = cells(lines[1]);
  const rows = lines.slice(2).map(cells);
  if (header.length < 1 || delimiter.length !== header.length) return null;
  if (rows.some((r) => r.length !== header.length)) return null;
  return { header, delimiter, rows };
}

export function formatTable(t: ParsedTable): string {
  const line = (cells: string[]) => `| ${cells.join(" | ")} |`;
  return [line(t.header), line(t.delimiter), ...t.rows.map(line)].join("\n");
}

/** A cell's value as a number when it reads as one: 1,234 · $12.50 · -3% · (42) · 1.2e3. */
function numeric(cell: string): number | null {
  let s = cell.replace(/[*_`]/g, "").trim();
  const negative = /^\(.*\)$/.test(s);
  s = s.replace(/^\(|\)$/g, "").replace(/[$€£,%\s]/g, "");
  if (!s || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return negative ? -n : n;
}

/**
 * Rows sorted by one column. Numbers compare as numbers when both cells are numeric, text
 * compares naturally ("item 2" before "item 10"), and empty cells always sink to the bottom.
 * The sort is stable, so sorting by a second column keeps the first as the tiebreaker.
 */
export function sortTable(text: string, col: number, dir: "asc" | "desc"): string | null {
  const t = parseTable(text);
  if (!t || col < 0 || col >= t.header.length) return null;
  const sign = dir === "asc" ? 1 : -1;
  const rows = t.rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => {
      const x = a.row[col];
      const y = b.row[col];
      if (!x && !y) return a.i - b.i;
      if (!x) return 1;
      if (!y) return -1;
      const nx = numeric(x);
      const ny = numeric(y);
      const c =
        nx !== null && ny !== null
          ? nx - ny
          : x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
      return c !== 0 ? c * sign : a.i - b.i;
    })
    .map(({ row }) => row);
  return formatTable({ ...t, rows });
}

/** The table without one column; null when it is the only column left. */
export function deleteTableColumn(text: string, col: number): string | null {
  const t = parseTable(text);
  if (!t || t.header.length < 2 || col < 0 || col >= t.header.length) return null;
  const drop = (cells: string[]) => cells.filter((_, i) => i !== col);
  return formatTable({ header: drop(t.header), delimiter: drop(t.delimiter), rows: t.rows.map(drop) });
}
