import { describe, expect, it } from "vitest";
import {
  continueListOnEnter,
  isUrl,
  mergeTexts,
  splitAt,
  wrapSelectionAsLink,
} from "@/lib/editor";

describe("continueListOnEnter", () => {
  const at = (text: string) => continueListOnEnter(text, text.length);

  it("continues a bullet list", () => {
    expect(at("- alpha")).toEqual({ text: "- alpha\n- ", caret: 10 });
  });

  it("continues a task list with an empty box", () => {
    expect(at("* [x] done")?.text).toBe("* [x] done\n* [ ] ");
  });

  it("increments an ordered list", () => {
    expect(at("3. third")?.text).toBe("3. third\n4. ");
  });

  it("preserves indentation", () => {
    expect(at("  - nested")?.text).toBe("  - nested\n  - ");
  });

  it("clears an empty marker instead of continuing", () => {
    expect(at("- alpha\n- ")).toEqual({ text: "- alpha\n", caret: 8 });
  });

  it("clears an empty task marker", () => {
    expect(at("* [ ] ")).toEqual({ text: "", caret: 0 });
  });

  it("returns null outside a list so Enter behaves normally", () => {
    expect(at("just a line")).toBeNull();
    expect(at("# heading")).toBeNull();
  });

  it("splits mid-line, carrying the rest down", () => {
    const text = "- alphabeta";
    expect(continueListOnEnter(text, 7)).toEqual({ text: "- alpha\n- beta", caret: 10 });
  });
});

describe("wrapSelectionAsLink", () => {
  it("wraps the selected text", () => {
    const text = "see the runbook here";
    expect(wrapSelectionAsLink(text, 8, 15, "https://x.test/r")).toEqual({
      text: "see the [runbook](https://x.test/r) here",
      caret: 35,
    });
  });

  it("trims the selection and the url", () => {
    expect(wrapSelectionAsLink("a boards b", 2, 8, "  https://x.test/  ").text).toBe(
      "a [boards](https://x.test/) b",
    );
  });
});

describe("isUrl", () => {
  it("accepts http, https and mailto", () => {
    expect(isUrl("https://dev.azure.com/inscriptrx/Org/_sprints")).toBe(true);
    expect(isUrl(" http://x.test/a ")).toBe(true);
    expect(isUrl("mailto:clem@example.com")).toBe(true);
  });

  it("rejects text, bare domains and multi-token strings", () => {
    expect(isUrl("boards")).toBe(false);
    expect(isUrl("dev.azure.com")).toBe(false);
    expect(isUrl("https://x.test/a and more")).toBe(false);
  });
});

describe("splitAt and mergeTexts", () => {
  it("splits and trims both halves", () => {
    expect(splitAt("alpha\n\nbeta", 6)).toEqual(["alpha", "beta"]);
  });

  it("merges with a blank line between", () => {
    expect(mergeTexts("alpha", "beta")).toBe("alpha\n\nbeta");
  });

  it("tolerates an empty side", () => {
    expect(mergeTexts("", "beta")).toBe("beta");
    expect(mergeTexts("alpha", "  ")).toBe("alpha");
  });
});
