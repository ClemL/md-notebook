import { expect, test, type Page } from "@playwright/test";

const CODE_ENTRY =
  "# Heading\n\nSome `inline` and a link https://example.com\n\n```ts\nconst x: number = 1;\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n";

async function addEntry(page: Page, text: string) {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.fill(text);
  await ta.press("Control+Enter");
  await expect(page.locator("textarea.editor")).toHaveCount(0);
}

/** The app hydrates before it is interactive; every navigation waits for that marker. */
async function ready(page: Page) {
  await page.waitForSelector('.app[data-ready="true"]');
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test("renders on blur and reopens with Edit", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await expect(ta).toBeFocused();
  await ta.fill(CODE_ENTRY);

  await page.locator("body").click({ position: { x: 5, y: 500 } });
  await expect(page.locator("textarea.editor")).toHaveCount(0);
  await expect(page.locator(".md h1")).toHaveText("Heading");
  await expect(page.locator(".md p code").first()).toBeVisible();
  await expect(page.locator(".md pre code .hljs-keyword").first()).toBeVisible();
  await expect(page.locator(".md table td")).toHaveCount(2);
  await expect(page.locator('.md a[href="https://example.com"]')).toHaveAttribute("target", "_blank");

  await page.getByRole("button", { name: /Edit this entry/ }).click();
  await expect(page.locator("textarea.editor")).toBeVisible();
});

test("paste new pulls the clipboard into a focused entry", async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText("pasted from the clipboard"));
  await page.getByRole("button", { name: /New entry from clipboard/ }).click();
  const ta = page.locator("textarea.editor");
  await expect(ta).toBeFocused();
  await expect(ta).toHaveValue("pasted from the clipboard");
});

test("checkbox button is idempotent and does not close the editor", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.fill("alpha\nbeta\n\ngamma");

  await page.locator(".cell.editing").getByRole("button", { name: /Prefix every line/ }).click();
  await expect(ta).toHaveValue("* [ ] alpha\n* [ ] beta\n\n* [ ] gamma");
  await expect(page.locator("textarea.editor")).toHaveCount(1);

  await page.locator(".cell.editing").getByRole("button", { name: /Prefix every line/ }).click();
  await expect(ta).toHaveValue("* [ ] alpha\n* [ ] beta\n\n* [ ] gamma");

  await ta.press("Escape");
  await expect(page.locator('.md li.task input[type="checkbox"]')).toHaveCount(3);
});

test("rendered task checkboxes write back to the markdown source", async ({ page }) => {
  await addEntry(page, "* [ ] first\n* [ ] second");
  await page.locator('.md li.task input[type="checkbox"]').first().check();

  await page.getByRole("button", { name: /Edit this entry/ }).click();
  await expect(page.locator("textarea.editor")).toHaveValue("* [x] first\n* [ ] second");
  await page.locator("textarea.editor").press("Escape");

  await page.locator('.md li.task input[type="checkbox"]').first().uncheck();
  await page.getByRole("button", { name: /Edit this entry/ }).click();
  await expect(page.locator("textarea.editor")).toHaveValue("* [ ] first\n* [ ] second");
});

test("code blocks expose a copy button", async ({ page }) => {
  await addEntry(page, "```sql\nSELECT 1;\n```");
  await page.locator(".codeblock").hover();
  await page.getByRole("button", { name: "Copy code block" }).click();
  await expect(page.getByRole("button", { name: "Copy code block" })).toHaveText("copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("SELECT 1;\n");
});

test("search filters entries and scopes copy and export", async ({ page }) => {
  await addEntry(page, "optum sftp rotation");
  await addEntry(page, "pharmaforce daily feed");
  await addEntry(page, "optum weekly reconciliation");

  await page.keyboard.press("Control+k");
  await page.keyboard.type("optum");
  await expect(page.locator("section.cell")).toHaveCount(2);
  await expect(page.locator(".search .count")).toHaveText("2/3");

  await page.getByRole("button", { name: /Copy the filtered entries/ }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("optum sftp rotation");
  expect(copied).not.toContain("pharmaforce");

  await page.locator(".search input").press("Escape");
  await expect(page.locator("section.cell")).toHaveCount(3);
});

test("undo and redo cover delete, clear and edits", async ({ page }) => {
  await addEntry(page, "keep me");
  await addEntry(page, "delete me");

  await page.locator("section.cell").last().getByRole("button", { name: /Delete this entry/ }).click();
  await expect(page.locator("section.cell")).toHaveCount(1);

  await page.keyboard.press("Control+z");
  await expect(page.locator("section.cell")).toHaveCount(2);
  await expect(page.locator("section.cell").last()).toContainText("delete me");

  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("section.cell")).toHaveCount(1);

  // Edits collapse into a single undo step per editing session.
  await page.getByRole("button", { name: /Edit this entry/ }).click();
  await page.locator("textarea.editor").fill("keep me, edited");
  await page.locator("textarea.editor").press("Escape");
  await expect(page.locator(".md")).toContainText("keep me, edited");
  await page.keyboard.press("Control+z");
  await expect(page.locator(".md")).toContainText("keep me");
  await expect(page.locator(".md")).not.toContainText("edited");

  // Clear all is recoverable too.
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("button", { name: "Delete all entries" }).click();
  await expect(page.getByText("No entries yet")).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(page.locator("section.cell")).toHaveCount(1);
});

test("keyboard command mode navigates, inserts and deletes", async ({ page }) => {
  await addEntry(page, "one");
  await addEntry(page, "two");

  await page.keyboard.press("j");
  await page.keyboard.press("j");
  await expect(page.locator("section.cell.selected")).toContainText("two");
  await page.keyboard.press("k");
  await expect(page.locator("section.cell.selected")).toContainText("one");

  await page.keyboard.press("Enter");
  await expect(page.locator("textarea.editor")).toBeVisible();
  await page.locator("textarea.editor").press("Escape");

  await page.keyboard.press("b");
  await expect(page.locator("textarea.editor")).toBeVisible();
  await page.locator("textarea.editor").fill("inserted below one");
  await page.locator("textarea.editor").press("Escape");
  await expect(page.locator("section.cell").nth(1)).toContainText("inserted below one");

  await page.keyboard.press("d");
  await page.keyboard.press("d");
  await expect(page.locator("section.cell")).toHaveCount(2);
});

test("another tab's write is adopted without losing an open edit", async ({ page, context }) => {
  await addEntry(page, "shared entry");

  await page.getByRole("button", { name: /New empty entry/ }).click();
  await page.locator("textarea.editor").fill("draft in this tab");

  const other = await context.newPage();
  await other.goto("/");
  await ready(other);
  await expect(other.locator("section.cell")).toHaveCount(2);
  await other.getByRole("button", { name: /New empty entry/ }).click();
  await other.locator("textarea.editor").fill("written by the other tab");
  await other.locator("textarea.editor").press("Escape");

  await expect(page.locator("section.cell")).toHaveCount(3);
  await expect(page.locator("textarea.editor")).toHaveValue("draft in this tab");
  await page.locator("textarea.editor").press("Escape");
  await expect(page.locator("section.cell")).toHaveCount(3);

  await page.reload();
  await ready(page);
  const texts = await page.locator("section.cell").allInnerTexts();
  expect(texts.join("\n")).toContain("written by the other tab");
  expect(texts.join("\n")).toContain("draft in this tab");
  await other.close();
});

test("export writes a timestamped file and json backup round-trips", async ({ page }) => {
  await addEntry(page, "first entry");
  await addEntry(page, "second entry");

  const [md] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download every entry/ }).click(),
  ]);
  expect(md.suggestedFilename()).toMatch(/^md-notebook_\d{8}_\d{4}\.md$/);
  const mdBody = await (await import("node:fs/promises")).readFile(await md.path(), "utf8");
  expect(mdBody).toBe("first entry\n\n---\n\nsecond entry\n");

  await page.getByRole("button", { name: "More actions" }).click();
  const [json] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Backup as .json" }).click(),
  ]);
  expect(json.suggestedFilename()).toMatch(/^md-notebook-backup_\d{8}_\d{4}\.json$/);
  const backup = JSON.parse(
    await (await import("node:fs/promises")).readFile(await json.path(), "utf8"),
  );
  expect(backup.cells).toHaveLength(2);
  expect(backup.cells[0].createdAt).toBeGreaterThan(0);
});

test("dropping a markdown file splits it into entries", async ({ page }) => {
  await page.locator("body").evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["alpha\n\n---\n\nbeta"], "notes.md", { type: "text/markdown" }));
    window.dispatchEvent(new DragEvent("drop", { bubbles: true, dataTransfer: dt }));
  });
  await expect(page.locator("section.cell")).toHaveCount(2);
  await expect(page.locator("section.cell").first()).toContainText("alpha");
});

test("rich paste converts clipboard HTML to markdown", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      "<h2>Vendor feeds</h2><ul><li><b>Optum</b> weekly</li></ul><p><a href='https://example.com/feed'>runbook</a></p>",
    );
    dt.setData("text/plain", "Vendor feeds Optum weekly runbook");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue(
    "## Vendor feeds\n\n-   **Optum** weekly\n\n[runbook](https://example.com/feed)",
  );
});

test("plain-text paste is left untouched", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.fill("");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/html", "<div style='color:#fff'>const x = 1;</div>");
    dt.setData("text/plain", "const x = 1;");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    // Not prevented: the browser inserts the plain text itself, which the harness simulates.
  });
  await page.keyboard.insertText("const x = 1;");
  await expect(ta).toHaveValue("const x = 1;");
});

test("entries persist across reload with timestamps", async ({ page }) => {
  await addEntry(page, "persisted");
  await expect(page.locator(".stamp")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  await page.reload();
  await ready(page);
  await expect(page.locator("section.cell")).toHaveCount(1);
  await expect(page.locator(".md")).toContainText("persisted");
});

test("tooltips describe buttons and show their hotkey", async ({ page }) => {
  const btn = page.getByRole("button", { name: /New entry from clipboard/ });
  const tip = page.locator(".tipwrap", { has: btn }).locator(".tip");
  await expect(tip).toBeHidden();
  await btn.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toContainText("New entry from clipboard");
  await expect(tip.locator("kbd")).toHaveText("Ctrl+Shift+V");
});

test("no horizontal overflow at phone width", async ({ page }) => {
  await addEntry(page, "```\nan extremely long line ".repeat(6) + "\n```");
  await page.setViewportSize({ width: 400, height: 800 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
