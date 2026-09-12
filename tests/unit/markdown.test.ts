import { describe, expect, it } from "vitest";
import {
  joinCells,
  makeBackup,
  makeCell,
  matchesQuery,
  parseBackup,
  parseStored,
  splitMarkdown,
  timestamp,
  toCheckboxes,
  toggleTaskAtLine,
} from "@/lib/markdown";

describe("toCheckboxes", () => {
  it("prefixes every non-empty line and leaves blank lines alone", () => {
    expect(toCheckboxes("alpha\nbeta\n\ngamma")).toBe("* [ ] alpha\n* [ ] beta\n\n* [ ] gamma");
  });

  it("is idempotent", () => {
    const once = toCheckboxes("alpha\nbeta");
    expect(toCheckboxes(once)).toBe(once);
  });

  it("converts existing bullets instead of doubling them", () => {
    expect(toCheckboxes("- alpha\n1. beta\n+ gamma")).toBe("* [ ] alpha\n* [ ] beta\n* [ ] gamma");
  });

  it("keeps indentation and already-checked items", () => {
    expect(toCheckboxes("  - alpha\n* [x] done")).toBe("  * [ ] alpha\n* [x] done");
  });
});

describe("toggleTaskAtLine", () => {
  const src = "* [ ] alpha\n* [x] beta\nplain line";

  it("checks an unchecked task", () => {
    expect(toggleTaskAtLine(src, 1)).toBe("* [x] alpha\n* [x] beta\nplain line");
  });

  it("unchecks a checked task", () => {
    expect(toggleTaskAtLine(src, 2)).toBe("* [ ] alpha\n* [ ] beta\nplain line");
  });

  it("ignores lines without a task marker and out-of-range lines", () => {
    expect(toggleTaskAtLine(src, 3)).toBe(src);
    expect(toggleTaskAtLine(src, 0)).toBe(src);
    expect(toggleTaskAtLine(src, 99)).toBe(src);
  });

  it("handles ordered and indented tasks", () => {
    expect(toggleTaskAtLine("  1. [ ] nested", 1)).toBe("  1. [x] nested");
  });
});

describe("joinCells", () => {
  const cells = [makeCell("one"), makeCell("  "), makeCell("two")];

  it("drops blank entries and separates with a rule", () => {
    expect(joinCells(cells, true)).toBe("one\n\n---\n\ntwo\n");
  });

  it("separates with a blank line when rules are off", () => {
    expect(joinCells(cells, false)).toBe("one\n\ntwo\n");
  });

  it("returns an empty string for an empty notebook", () => {
    expect(joinCells([], true)).toBe("");
  });
});

describe("splitMarkdown", () => {
  it("splits on thematic breaks", () => {
    const cells = splitMarkdown("one\n\n---\n\ntwo\n\n***\n\nthree");
    expect(cells.map((c) => c.text)).toEqual(["one", "two", "three"]);
  });

  it("does not split inside a fenced code block", () => {
    const md = "intro\n\n```sh\n---\n```\n\n---\n\ntail";
    expect(splitMarkdown(md).map((c) => c.text)).toEqual(["intro\n\n```sh\n---\n```", "tail"]);
  });

  it("returns a single cell when there is no break", () => {
    expect(splitMarkdown("just text")).toHaveLength(1);
  });

  it("ignores an empty file", () => {
    expect(splitMarkdown("\n\n")).toHaveLength(0);
  });
});

describe("matchesQuery", () => {
  const cell = makeCell("Azure Storage SAS token for BILH");

  it("matches case-insensitively", () => {
    expect(matchesQuery(cell, "sas TOKEN")).toBe(true);
  });

  it("requires every term", () => {
    expect(matchesQuery(cell, "sas optum")).toBe(false);
  });

  it("treats an empty query as a match", () => {
    expect(matchesQuery(cell, "   ")).toBe(true);
  });
});

describe("backup round-trip", () => {
  it("restores cells with their timestamps", () => {
    const cells = [makeCell("one", 1_700_000_000_000), makeCell("two", 1_700_000_001_000)];
    const restored = parseBackup(makeBackup(cells));
    expect(restored).toEqual(cells);
  });

  it("accepts a bare array of cells", () => {
    expect(parseBackup('[{"id":"a","text":"x"}]')[0].text).toBe("x");
  });

  it("rejects unrelated JSON", () => {
    expect(() => parseBackup('{"hello":"world"}')).toThrow();
  });
});

describe("parseStored", () => {
  it("migrates v1 entries that carry no timestamps", () => {
    const cells = parseStored('[{"id":"a","text":"legacy"}]');
    expect(cells[0].text).toBe("legacy");
    expect(typeof cells[0].createdAt).toBe("number");
  });

  it("survives corrupt payloads", () => {
    expect(parseStored("not json")).toEqual([]);
    expect(parseStored(null)).toEqual([]);
  });
});

describe("timestamp", () => {
  it("formats as yyyyMMdd_HHmm", () => {
    expect(timestamp(new Date(2026, 8, 12, 7, 5))).toBe("20260912_0705");
  });
});
