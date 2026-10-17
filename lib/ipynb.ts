/**
 * Jupyter notebooks (.ipynb, nbformat 4) in and out.
 *
 * Every entry becomes a markdown cell, so the file opens in VS Code, JupyterLab and GitHub without
 * a kernel. Images travel as cell attachments, the one place a text notebook format carries pixels,
 * which makes the export the lossless backup that other tools can also read. What only this app
 * understands — timestamps, annotations, the image view — rides in each cell's `metadata.mdnb`, and
 * is read back on import. An annotated image's attachment is the flattened picture, so other tools
 * show the markup; the clean original is kept in the metadata so the shapes stay editable here.
 *
 * Importing a notebook from elsewhere keeps what reads as notes: markdown cells as they are, code
 * and raw cells as fenced blocks, text outputs as a fenced block under their code, and image
 * outputs and attachments as image entries.
 */

import { makeCell, makeImageCell, type Cell } from "./markdown";
import type { ImageView, StoredImage } from "./image";

const VIEWS: readonly ImageView[] = ["thumb", "width", "original"];

const META = "mdnb";

type Source = string | string[];

type NbCell = {
  cell_type: "markdown" | "code" | "raw";
  id?: string;
  metadata?: Record<string, unknown>;
  source?: Source;
  attachments?: Record<string, Record<string, unknown>>;
  outputs?: NbOutput[];
};

type NbOutput = {
  output_type: "stream" | "execute_result" | "display_data" | "error";
  text?: Source;
  data?: Record<string, unknown>;
  ename?: string;
  evalue?: string;
};

type Notebook = {
  cells: NbCell[];
  metadata?: {
    language_info?: { name?: string };
    kernelspec?: { language?: string };
  };
  nbformat?: number;
};

/** What an entry's metadata carries so a round trip through the file loses nothing. */
type MdnbMeta = {
  createdAt?: number;
  updatedAt?: number;
  image?: Omit<StoredImage, "dataUrl"> & { original?: string };
};

/** nbformat stores source as lines, each keeping its newline except the last. */
function toSource(text: string): string[] {
  const lines = text.split("\n");
  return lines.map((l, i) => (i < lines.length - 1 ? `${l}\n` : l)).filter((l) => l !== "");
}

const fromSource = (source: Source | undefined): string =>
  Array.isArray(source) ? source.join("") : (source ?? "");

/** nbformat 4.5 cell ids: 1–64 characters of letters, digits, `-` and `_`. */
const cellId = (id: string, i: number) => id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || `cell-${i}`;

function splitDataUrl(dataUrl: string): { mime: string; data: string } {
  const m = dataUrl.match(/^data:([^;,]+)(?:;base64)?,([\s\S]*)$/);
  return { mime: m?.[1] ?? "image/png", data: m?.[2] ?? "" };
}

const extension = (mime: string) => (mime.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/\+.*/, "");

/**
 * The notebook as nbformat 4.5 JSON. `flattened` maps an annotated image entry's id to the data URL
 * of its picture with the shapes painted in, which is what other tools will display.
 */
export function toIpynb(cells: Cell[], flattened: ReadonlyMap<string, string> = new Map()): string {
  const nbCells: NbCell[] = cells.map((cell, i) => {
    const meta: MdnbMeta = { createdAt: cell.createdAt, updatedAt: cell.updatedAt };
    if (!cell.image) {
      return { cell_type: "markdown", id: cellId(cell.id, i), metadata: { [META]: meta }, source: toSource(cell.text) };
    }
    const { dataUrl, ...rest } = cell.image;
    const shown = flattened.get(cell.id);
    const { mime, data } = splitDataUrl(shown ?? dataUrl);
    const name = `image.${extension(mime)}`;
    meta.image = shown ? { ...rest, original: dataUrl } : rest;
    return {
      cell_type: "markdown",
      id: cellId(cell.id, i),
      metadata: { [META]: meta },
      source: toSource(`![${rest.name ?? "image"}](attachment:${name})`),
      attachments: { [name]: { [mime]: data } },
    };
  });
  const notebook = { cells: nbCells, metadata: {}, nbformat: 4, nbformat_minor: 5 };
  return JSON.stringify(notebook, null, 1) + "\n";
}

/** One piece of an imported notebook, before any image is decoded. */
export type IpynbPart =
  | { kind: "text"; text: string; createdAt?: number; updatedAt?: number }
  | {
      kind: "image";
      dataUrl: string;
      /** Present when the image came from this app: its size, annotations and view. */
      stored?: Omit<StoredImage, "dataUrl">;
      name?: string;
      createdAt?: number;
      updatedAt?: number;
    };

/** A fence longer than any backtick run inside the code, so the code cannot close it early. */
function fenced(code: string, lang = ""): string {
  const longest = Math.max(0, ...(code.match(/`{3,}/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}${lang}\n${code.replace(/\n$/, "")}\n${fence}`;
}

const ATTACHMENT_REF = /!\[[^\]]*\]\(attachment:[^)]*\)/g;

function imageEntries(bundle: Record<string, unknown> | undefined): string[] {
  if (!bundle) return [];
  return Object.entries(bundle)
    .filter(([mime, data]) => /^image\/(png|jpe?g|gif|webp)$/.test(mime) && typeof data === "string")
    .map(([mime, data]) => `data:${mime};base64,${(data as string).replace(/\s+/g, "")}`)
    .slice(0, 1);
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function readMeta(cell: NbCell): MdnbMeta {
  const meta = cell.metadata?.[META];
  return meta && typeof meta === "object" ? (meta as MdnbMeta) : {};
}

/** Text from an output, when it has some: a stream, a result's plain text, or an error line. */
function outputText(out: NbOutput): string | null {
  if (out.output_type === "stream") return fromSource(out.text);
  if (out.output_type === "error") return `${out.ename ?? "Error"}: ${out.evalue ?? ""}`;
  const plain = out.data?.["text/plain"];
  return typeof plain === "string" || Array.isArray(plain) ? fromSource(plain as Source) : null;
}

/** Parses a notebook into entries-to-be. Throws when the file is not an nbformat 4 notebook. */
export function parseIpynb(json: string): IpynbPart[] {
  let nb: Notebook;
  try {
    nb = JSON.parse(json) as Notebook;
  } catch {
    throw new Error("That file is not valid JSON, so it is not a notebook.");
  }
  if (!nb || !Array.isArray(nb.cells)) {
    throw new Error(
      nb && typeof nb === "object" && "worksheets" in nb
        ? "Only nbformat 4 notebooks can be imported; open and re-save this one in Jupyter first."
        : "That file is not a Jupyter notebook.",
    );
  }
  const language = nb.metadata?.language_info?.name ?? nb.metadata?.kernelspec?.language ?? "";

  const parts: IpynbPart[] = [];
  for (const cell of nb.cells) {
    const source = fromSource(cell.source);
    const meta = readMeta(cell);
    const stamps = { createdAt: num(meta.createdAt), updatedAt: num(meta.updatedAt) };

    if (cell.cell_type === "markdown") {
      const attached = Object.values(cell.attachments ?? {}).flatMap((bundle) => imageEntries(bundle));
      // An image entry written by this app: one attachment and nothing else in the cell.
      if (meta.image && attached.length === 1 && !source.replace(ATTACHMENT_REF, "").trim()) {
        const { original, ...stored } = meta.image;
        parts.push({
          kind: "image",
          dataUrl: typeof original === "string" && original.startsWith("data:image/") ? original : attached[0],
          stored,
          ...stamps,
        });
        continue;
      }
      const text = attached.length ? source.replace(ATTACHMENT_REF, "").trim() : source.trim();
      if (text) parts.push({ kind: "text", text, ...stamps });
      for (const dataUrl of attached) parts.push({ kind: "image", dataUrl, ...stamps });
      continue;
    }

    if (cell.cell_type === "raw") {
      if (source.trim()) parts.push({ kind: "text", text: fenced(source), ...stamps });
      continue;
    }

    // A code cell: the code fenced in its language, then its text output fenced beneath it.
    const vscode = cell.metadata?.vscode as { languageId?: string } | undefined;
    const blocks = source.trim() ? [fenced(source, vscode?.languageId ?? language)] : [];
    const images: string[] = [];
    const printed: string[] = [];
    for (const out of cell.outputs ?? []) {
      const pictures = imageEntries(out.data);
      if (pictures.length) {
        images.push(...pictures);
        continue;
      }
      const text = outputText(out);
      if (text?.trim()) printed.push(text.replace(/\n$/, ""));
    }
    if (printed.length) blocks.push(fenced(printed.join("\n"), "text"));
    if (blocks.length) parts.push({ kind: "text", text: blocks.join("\n\n"), ...stamps });
    for (const dataUrl of images) parts.push({ kind: "image", dataUrl, ...stamps });
  }
  return parts;
}

/**
 * Entries from parsed parts. An image this app wrote keeps its stored size and annotations as
 * they are; any other image goes through `store`, which decodes it and fits it to the storage budget.
 */
export async function partsToCells(
  parts: IpynbPart[],
  store: (dataUrl: string) => Promise<StoredImage>,
  now = Date.now(),
): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (const part of parts) {
    const created = part.createdAt ?? now;
    const stamped = (cell: Cell): Cell => ({ ...cell, createdAt: created, updatedAt: part.updatedAt ?? created });
    if (part.kind === "text") {
      cells.push(stamped(makeCell(part.text, now)));
      continue;
    }
    const s = part.stored;
    const image: StoredImage =
      s && num(s.width) && num(s.height)
        ? {
            dataUrl: part.dataUrl,
            width: s.width,
            height: s.height,
            bytes: part.dataUrl.length,
            addedAt: num(s.addedAt) ?? created,
            name: typeof s.name === "string" ? s.name : undefined,
            annotations: Array.isArray(s.annotations) ? s.annotations : undefined,
            view: s.view && VIEWS.includes(s.view) ? s.view : undefined,
          }
        : await store(part.dataUrl);
    cells.push(stamped(makeImageCell(image, now)));
  }
  return cells;
}
