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

/**
 * Comma-separated values as a CSV export writes them (RFC 4180): fields optionally in double
 * quotes, "" for a literal quote, and commas or line breaks allowed inside quotes. The first row
 * is taken as the header. Line breaks inside a field become spaces, since a table cell is one line.
 *
 * Prose has commas too, so the guards are strict: at least two rows, every row exactly as wide as
 * the header, and either a quoted field somewhere or at least three columns. Text with pipe rows
 * is left to the pipe-table repair.
 */
export function parseCsv(text: string, { strict = true }: { strict?: boolean } = {}): string[][] | null {
  const src = text.replace(/\r\n?/g, "\n").trim();
  if (!src.includes(",") || /^\s*\|/m.test(src)) return null;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let sawQuote = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch === "\n" ? " " : ch;
      }
    } else if (ch === '"' && !field.trim()) {
      quoted = true;
      sawQuote = true;
      field = "";
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (quoted) return null;
  row.push(field);
  if (row.some((f) => f.trim())) rows.push(row);

  if (rows.length < 2) return null;
  const width = rows[0].length;
  if (width < 2 || rows.some((r) => r.length !== width)) return null;
  // A file named .csv is CSV by declaration, so the guard against prose does not apply.
  if (strict && !sawQuote && width < 3) return null;
  return rows.map((r) => r.map((f) => f.trim()));
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** A JSON value as one table cell: nothing for null, nested objects and arrays as compact JSON. */
const jsonCell = (v: unknown): string =>
  v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);

/**
 * A JSON array of objects — `az … -o json`, SQL Server's FOR JSON PATH, a REST response — as
 * rows, the keys becoming the header in the order they first appear. An Azure DevOps style
 * `{ "count": n, "value": [ … ] }` envelope is unwrapped. Anything else, a scalar array or a
 * single object, is not a table.
 */
export function parseJsonRows(text: string): string[][] | null {
  const src = text.trim();
  if (!/^[[{]/.test(src)) return null;
  let data: unknown;
  try {
    data = JSON.parse(src);
  } catch {
    return null;
  }
  if (isRecord(data) && Array.isArray(data.value)) data = data.value;
  if (!Array.isArray(data) || !data.length || !data.every(isRecord)) return null;
  const keys = [...new Set(data.flatMap((row) => Object.keys(row)))];
  if (!keys.length) return null;
  return [keys, ...data.map((row) => keys.map((k) => jsonCell(row[k])))];
}

/** Markdown table for tabular text, or null when the text is not tabular. */
export function maybeTable(text: string): string | null {
  const json = parseJsonRows(text);
  if (json) return rowsToMarkdownTable(json);
  const delimited = parseDelimited(text);
  if (delimited) return rowsToMarkdownTable(delimited);
  const csv = parseCsv(text);
  if (csv) return rowsToMarkdownTable(csv);
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

/* ------------------------------------------------------- copying a table back out */

/** A cell as data rather than markdown: escaped pipes restored, `<br>` read as a line break. */
const plainCell = (cell: string) => cell.replace(/\\\|/g, "|").replace(/<br\s*\/?>/gi, "\n").trim();

/** Header plus body rows of a table entry as plain values, or null when the text is not a table. */
export function tableRows(text: string): string[][] | null {
  const t = parseTable(text);
  if (!t) return null;
  return [t.header, ...t.rows].map((row) => row.map(plainCell));
}

/** Tab-separated, which Excel splits into cells on paste. Tabs and line breaks in a value become spaces. */
export function toTsv(rows: string[][]): string {
  return rows.map((row) => row.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n") + "\n";
}

/** RFC 4180: a value holding a comma, quote or line break is quoted, with quotes doubled. CRLF rows. */
export function toCsv(rows: string[][]): string {
  const field = (c: string) => (/[",\r\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/**
 * A number only when it reads back identically: `42`, `-3.5`, `1e6`. `007`, `1,200` and `$5`
 * stay text, since an ID with leading zeros or a formatted amount is not the number it resembles.
 */
function plainNumber(cell: string): number | null {
  if (!/^-?(0|[1-9]\d*)(\.\d+)?([eE][-+]?\d+)?$/.test(cell)) return null;
  const n = Number(cell);
  return Number.isFinite(n) ? n : null;
}

/** Header cells made unique, so no column is lost as a JSON key: `Name`, `Name_2`. */
function uniqueKeys(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h, i) => {
    const base = h || `Column${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/** An array of objects keyed by the header. Plain numbers become numbers; empty cells become null. */
export function toJsonRows(rows: string[][]): string {
  const [header, ...body] = rows;
  const keys = uniqueKeys(header);
  const objects = body.map((row) =>
    Object.fromEntries(keys.map((k, i) => [k, row[i] ? (plainNumber(row[i]) ?? row[i]) : null])),
  );
  return JSON.stringify(objects, null, 2) + "\n";
}

const sqlName = (name: string) => `[${name.replace(/]/g, "]]")}]`;
const sqlValue = (cell: string) =>
  !cell ? "NULL" : plainNumber(cell) !== null ? cell : `N'${cell.replace(/'/g, "''")}'`;
const sqlRow = (row: string[], width: number) =>
  `(${Array.from({ length: width }, (_, i) => sqlValue(row[i] ?? "")).join(", ")})`;

/** SQL Server accepts at most 1000 rows in one VALUES list. */
const SQL_BATCH = 1000;

/**
 * T-SQL that loads the table: a CREATE TABLE with NVARCHAR(MAX) columns (left for you to
 * tighten) and INSERT statements in batches of 1000 rows. Plain numbers go in unquoted, empty
 * cells as NULL, everything else as N'…' with quotes doubled.
 */
export function toSqlInsert(rows: string[][], table = "#Pasted"): string {
  const [header, ...body] = rows;
  const cols = uniqueKeys(header).map(sqlName);
  const target = table.trim() || "#Pasted";
  const out = [
    `CREATE TABLE ${target} (\n${cols.map((c) => `    ${c} NVARCHAR(MAX) NULL`).join(",\n")}\n);`,
  ];
  for (let i = 0; i < body.length; i += SQL_BATCH) {
    const batch = body.slice(i, i + SQL_BATCH).map((r) => `    ${sqlRow(r, cols.length)}`);
    out.push(`INSERT INTO ${target} (${cols.join(", ")}) VALUES\n${batch.join(",\n")};`);
  }
  return out.join("\n\n") + "\n";
}

/**
 * The table as an inline derived table, for joining against without creating anything:
 * `SELECT * FROM (VALUES …) AS t ([A], [B])`. A table constructor has no 1000-row limit.
 */
export function toSqlValues(rows: string[][], alias = "t"): string {
  const [header, ...body] = rows;
  const cols = uniqueKeys(header).map(sqlName);
  const values = body.length
    ? body.map((r) => `    ${sqlRow(r, cols.length)}`).join(",\n")
    : `    ${sqlRow([], cols.length)}`;
  return `SELECT *\nFROM (VALUES\n${values}\n) AS ${alias} (${cols.join(", ")});\n`;
}
