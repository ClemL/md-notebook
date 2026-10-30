import { describe, expect, it } from "vitest";
import { parseChangelog } from "@/lib/changelog";

describe("changelog parsing", () => {
  it("keeps one entry per line, oldest first", () => {
    expect(parseChangelog("2026-01-01T00:00:00Z - First\n2026-01-02T00:00:00Z - Second\n")).toEqual([
      "2026-01-01T00:00:00Z - First",
      "2026-01-02T00:00:00Z - Second",
    ]);
  });

  it("reads Windows line endings", () => {
    expect(parseChangelog("one\r\ntwo\r\n")).toEqual(["one", "two"]);
  });

  it("trims lines and skips blank ones", () => {
    expect(parseChangelog("\n  one  \n\n\t\n two\n\n")).toEqual(["one", "two"]);
  });

  it("yields nothing for an empty or whitespace-only file", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(parseChangelog("\n\n   \r\n\t\n")).toEqual([]);
  });
});
