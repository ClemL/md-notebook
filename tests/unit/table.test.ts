import { describe, expect, it } from "vitest";
import { blankTable, maybeTable, parseDelimited, repairPipeTable, rowsToMarkdownTable } from "@/lib/table";
import { TEMPLATES } from "@/lib/templates";

describe("tab-separated paste", () => {
  it("converts an Excel grid to a markdown table", () => {
    const tsv = "Vendor\tFeed\tOwner\nPharmaForce\tdaily\tSrini\nOptum\tweekly\tTeja";
    expect(maybeTable(tsv)).toBe(
      [
        "| Vendor | Feed | Owner |",
        "| --- | --- | --- |",
        "| PharmaForce | daily | Srini |",
        "| Optum | weekly | Teja |",
      ].join("\n"),
    );
  });

  it("escapes pipes inside cells", () => {
    expect(maybeTable("a\tb\nx|y\tz")).toContain("| x\\|y | z |");
  });

  it("ignores single lines, untabbed text and ragged grids", () => {
    expect(parseDelimited("Vendor\tFeed")).toBeNull();
    expect(parseDelimited("no tabs here\nsecond line")).toBeNull();
    expect(parseDelimited("a\tb\tc\td\ne")).toBeNull();
  });
});

describe("pipe rows without a delimiter row", () => {
  it("inserts the delimiter row GFM requires", () => {
    expect(repairPipeTable("| Vendor | Feed |\n| Optum | weekly |")).toBe(
      "| Vendor | Feed |\n| --- | --- |\n| Optum | weekly |",
    );
  });

  it("leaves a table that already has one alone", () => {
    expect(repairPipeTable("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBeNull();
    expect(repairPipeTable("| a | b |\n|:--|--:|\n| 1 | 2 |")).toBeNull();
  });

  it("refuses rows of differing widths and prose containing a pipe", () => {
    expect(repairPipeTable("| a | b |\n| 1 |")).toBeNull();
    expect(repairPipeTable("run a | b to pipe\nthen c | d | e")).toBeNull();
  });
});

describe("rowsToMarkdownTable", () => {
  it("pads short rows to the widest row", () => {
    expect(rowsToMarkdownTable([["a", "b", "c"], ["1"]])).toBe(
      "| a | b | c |\n| --- | --- | --- |\n| 1 |  |  |",
    );
  });
});

describe("blank table templates", () => {
  it("builds a 2x2 with a header row", () => {
    expect(blankTable(2, 2)).toBe(
      "| Column A | Column B |\n| --- | --- |\n|  |  |\n|  |  |\n",
    );
  });

  it("builds a 3x3", () => {
    const md = blankTable(3, 3);
    expect(md.split("\n").filter(Boolean)).toHaveLength(5);
    expect(md).toContain("| Column A | Column B | Column C |");
  });

  it("is offered as templates", () => {
    expect(TEMPLATES.map((t) => t.label)).toEqual(
      expect.arrayContaining(["Table 2×2", "Table 3×3"]),
    );
  });
});
