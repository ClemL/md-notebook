import { describe, expect, it } from "vitest";
import { filterCommands, type Command } from "@/lib/commands";

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
