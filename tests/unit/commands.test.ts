import { describe, expect, it } from "vitest";
import { entrySnippet, filterCommands, type Command } from "@/lib/commands";
import { makeCell, makeImageCell } from "@/lib/markdown";

const cmd = (id: string, group: string, label: string): Command => ({ id, group, label, run: () => {} });
const ALL = [
  cmd("copy-all", "Notebook", "Copy all"),
  cmd("tsv", "Table", "Copy as TSV"),
  cmd("rich", "Entry", "Copy as rich text"),
  cmd("print", "Notebook", "Print / save as PDF"),
];

describe("command palette filter", () => {
  it("lists everything for an empty query", () => {
    expect(filterCommands(ALL, "  ")).toBe(ALL);
  });

  it("needs every term, matched in group or label", () => {
    expect(filterCommands(ALL, "table copy").map((c) => c.id)).toEqual(["tsv"]);
    expect(filterCommands(ALL, "pdf").map((c) => c.id)).toEqual(["print"]);
    expect(filterCommands(ALL, "nothing")).toEqual([]);
  });

  it("puts labels that start with the query first, keeping order otherwise", () => {
    expect(filterCommands(ALL, "copy as").map((c) => c.id)).toEqual(["tsv", "rich"]);
    expect(filterCommands(ALL, "print").map((c) => c.id)).toEqual(["print"]);
    expect(filterCommands(ALL, "rich").map((c) => c.id)).toEqual(["rich"]);
  });
});

describe("entry snippet for palette search results", () => {
  it("shows the first line holding the first term, without its list or heading marker", () => {
    const cell = makeCell("# Vendors\n\n* [ ] PharmaForce feed\n- Optum SFTP rotation");
    expect(entrySnippet(cell, "optum sftp")).toBe("Optum SFTP rotation");
    expect(entrySnippet(cell, "pharmaforce")).toBe("PharmaForce feed");
  });

  it("falls back to the first non-empty line", () => {
    expect(entrySnippet(makeCell("\n\n## 2026-10-18\nbody"), "")).toBe("2026-10-18");
    expect(entrySnippet(makeCell("  \n"), "x")).toBe("(empty entry)");
  });

  it("cuts a long line around the match", () => {
    const long = `${"a".repeat(100)} needle ${"b".repeat(100)}`;
    const out = entrySnippet(makeCell(long), "needle");
    expect(out.startsWith("…")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out).toContain("needle");
    expect(out.length).toBeLessThanOrEqual(82);
    expect(entrySnippet(makeCell("c".repeat(120)), "")).toBe(`${"c".repeat(80)}…`);
  });

  it("describes an image by its name and size", () => {
    const image = makeImageCell({ dataUrl: "data:image/png;base64,AA", width: 30, height: 20, bytes: 1, addedAt: 0, name: "shot.png" });
    expect(entrySnippet(image, "shot")).toBe("shot.png · 30×20");
  });
});
