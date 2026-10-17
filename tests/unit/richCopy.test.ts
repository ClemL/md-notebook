import { describe, expect, it } from "vitest";
import { imageHtml, joinHtml, markdownToHtml } from "@/lib/richCopy";

describe("rich-text copy", () => {
  it("renders GFM with inline styles a mail client keeps", () => {
    const html = markdownToHtml("| a | b |\n| :-: | --- |\n| 1 | 2 |");
    expect(html).toContain('<table style="border-collapse: collapse;');
    expect(html).toMatch(/<th align="center" style="[^"]*text-align: center;">a<\/th>/);
    expect(html).toContain("<td style=");
  });

  it("turns task checkboxes into characters, since pasted inputs are stripped", () => {
    const html = markdownToHtml("* [ ] open\n* [x] done");
    expect(html).not.toContain("<input");
    expect(html).toContain("☐ open");
    expect(html).toContain("☑ done");
    expect(html).toContain("list-style: none");
  });

  it("styles code without highlighting classes", () => {
    const html = markdownToHtml("Use `x`.\n\n```sql\nSELECT 1;\n```");
    expect(html).toMatch(/<code style="font-family: Consolas[^"]*">x<\/code>/);
    expect(html).toMatch(/<pre style="[^"]*"><code>SELECT 1;\n<\/code><\/pre>/);
  });

  it("keeps single newlines as line breaks and drops raw HTML", () => {
    expect(markdownToHtml("one\ntwo")).toBe("<p>one<br>\ntwo</p>");
    expect(markdownToHtml('<img src=x onerror="alert(1)">')).not.toContain("onerror");
  });

  it("joins entries with a rule when separators are on", () => {
    expect(joinHtml(["<p>a</p>", "", "<p>b</p>"], true)).toBe("<div><p>a</p>\n<hr>\n<p>b</p></div>");
    expect(joinHtml(["<p>a</p>", "<p>b</p>"], false)).toBe("<div><p>a</p>\n<p>b</p></div>");
    expect(imageHtml('data:x"y', 10.4, "a<b")).toBe('<img src="data:x&quot;y" alt="a&lt;b" width="10" style="max-width: 100%;">');
  });
});
