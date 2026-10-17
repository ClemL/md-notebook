import { expect, test, type Page } from "@playwright/test";

/** Rich copy, table export, Jupyter files, the command palette, the tools panel, Mermaid, print. */

const TABLE = "| Id | Name |\n| --- | --- |\n| 007 | O'Brien |\n| 8 | Smith |";

async function ready(page: Page) {
  await page.waitForSelector('.app[data-ready="true"]');
}

async function addEntry(page: Page, text: string) {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.fill(text);
  await ta.press("Control+Enter");
  await expect(page.locator("textarea.editor")).toHaveCount(0);
}

/** The clipboard's text/html flavor, or "" when it has none. */
async function clipboardHtml(page: Page): Promise<string> {
  return page.evaluate(async () => {
    for (const item of await navigator.clipboard.read()) {
      if (item.types.includes("text/html")) return (await item.getType("text/html")).text();
    }
    return "";
  });
}

const clipboardText = (page: Page) => page.evaluate(() => navigator.clipboard.readText());

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test("Rich copies an entry as styled HTML with the markdown as plain text", async ({ page }) => {
  await addEntry(page, "**bold** and\n* [x] done\n\n" + TABLE);
  const rich = page.getByRole("button", { name: /Copy formatted/ });
  await rich.click();
  await expect(rich).toHaveAttribute("data-flash", "on");

  const html = await clipboardHtml(page);
  expect(html).toContain("<strong>bold</strong>");
  expect(html).toContain("☑");
  expect(html).toContain('<table style="border-collapse: collapse;');
  expect(await clipboardText(page)).toContain("**bold** and");

  // Shift+C does the same from command mode.
  await page.evaluate(() => navigator.clipboard.writeText(""));
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+C");
  await expect.poll(() => clipboardHtml(page)).toContain("<strong>bold</strong>");
});

test("a table entry gets a TSV button that copies it for Excel", async ({ page }) => {
  await addEntry(page, "not a table");
  await expect(page.getByRole("button", { name: /tab-separated/ })).toHaveCount(0);
  await addEntry(page, TABLE);
  await page.getByRole("button", { name: /tab-separated/ }).click();
  await expect.poll(() => clipboardText(page)).toBe("Id\tName\n007\tO'Brien\n8\tSmith\n");
});

test("a pasted JSON array becomes a table", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", JSON.stringify([{ name: "rg-prod", location: "eastus" }, { name: "rg-dev", location: null }]));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue("| name | location |\n| --- | --- |\n| rg-prod | eastus |\n| rg-dev |  |");
});

test("the tools panel copies the selected table as CSV, JSON and SQL", async ({ page }) => {
  await addEntry(page, TABLE);
  await page.getByRole("button", { name: /^Tools/ }).click();
  const panel = page.getByRole("complementary", { name: "Tools" });
  await expect(panel).toContainText("2 rows × 2 columns");

  await panel.getByRole("button", { name: /Comma-separated/ }).click();
  await expect.poll(() => clipboardText(page)).toBe("Id,Name\r\n007,O'Brien\r\n8,Smith\r\n");

  await panel.getByRole("button", { name: /array of objects/ }).click();
  await expect.poll(() => clipboardText(page).then((t) => JSON.parse(t || "null"))).toEqual([
    { Id: "007", Name: "O'Brien" },
    { Id: 8, Name: "Smith" },
  ]);

  await panel.getByLabel("SQL table name").fill("#Stage");
  await panel.getByRole("button", { name: /CREATE TABLE plus INSERT/ }).click();
  await expect.poll(() => clipboardText(page)).toContain("INSERT INTO #Stage ([Id], [Name]) VALUES\n    (N'007', N'O''Brien'),\n    (8, N'Smith');");

  await panel.getByRole("button", { name: /SELECT \* FROM/ }).click();
  await expect.poll(() => clipboardText(page)).toContain(") AS t ([Id], [Name]);");

  // Esc in command mode closes it.
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("the command palette filters and runs actions", async ({ page }) => {
  await addEntry(page, TABLE);
  await page.locator("body").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("p");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette.getByRole("textbox")).toBeFocused();

  await page.keyboard.type("table tsv");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(palette).toHaveCount(0);
  await expect.poll(() => clipboardText(page)).toBe("Id\tName\n007\tO'Brien\n8\tSmith\n");

  // Ctrl+Shift+P opens it from anywhere; Esc closes it.
  await page.keyboard.press("Control+Shift+P");
  await expect(palette).toBeVisible();
  await page.keyboard.type("compact");
  await page.keyboard.press("Enter");
  await expect(page.locator(".app")).toHaveAttribute("data-compact", "on");
  await page.keyboard.press("Control+Shift+P");
  await page.keyboard.press("Escape");
  await expect(palette).toHaveCount(0);
});

test("an .ipynb export imports back with its images", async ({ page }) => {
  await addEntry(page, "# Notes\nfirst entry");
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 30;
    canvas.height = 20;
    canvas.getContext("2d")!.fillRect(0, 0, 30, 20);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
    const dt = new DataTransfer();
    dt.items.add(new File([blob], "shot.png", { type: "image/png" }));
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.locator("section.image-cell")).toHaveCount(1);

  await page.getByRole("button", { name: "More actions" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export as .ipynb" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^md-notebook_\d{8}_\d{4}\.ipynb$/);
  const fs = await import("node:fs/promises");
  const body = await fs.readFile(await download.path(), "utf8");
  const nb = JSON.parse(body);
  expect(nb.nbformat).toBe(4);
  expect(nb.cells[1].attachments["image.png"]["image/png"]).toMatch(/^iVBOR/);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
  await page.locator('input[type="file"]').setInputFiles({ name: "back.ipynb", mimeType: "application/json", buffer: Buffer.from(body) });
  await expect(page.locator(".md h1")).toHaveText("Notes");
  await expect(page.locator("section.image-cell")).toHaveCount(1);
  await expect(page.locator("section.image-cell")).toContainText("30×20");
});

test("a dropped .csv file becomes a table entry", async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles({
    name: "data.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\r\n1,2\r\n3,4\r\n"),
  });
  await expect(page.locator(".md table tbody tr")).toHaveCount(2);
});

test("a mermaid block renders as a diagram, and a broken one falls back to its source", async ({ page }) => {
  await addEntry(page, "```mermaid\ngraph LR\n  A[Pharmacy] --> B[Claims]\n```");
  await expect(page.locator(".mermaid-diagram svg")).toBeVisible({ timeout: 15000 });
  await expect(page.locator(".mermaid-diagram")).toContainText("Pharmacy");

  await addEntry(page, "```mermaid\nthis is not a diagram\n```");
  await expect(page.locator(".mermaid-error")).toBeVisible({ timeout: 15000 });
  await expect(page.locator("section.cell").nth(1).locator("pre code")).toContainText("this is not a diagram");
});

test("print shows every entry in full and hides the controls", async ({ page }) => {
  await addEntry(page, Array.from({ length: 80 }, (_, i) => `line ${i}`).join("\n"));
  await addEntry(page, "second\nentry\nthree\nlines");
  await page.locator("section.cell").nth(1).getByRole("button", { name: /Collapse to/ }).click();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("header.bar")).toBeHidden();
  await expect(page.getByRole("button", { name: /Edit this entry/ }).first()).toBeHidden();
  await expect(page.locator("section.cell").first().locator(".cell-body")).toHaveCSS("max-height", "none");
  await expect(page.locator("section.cell").nth(1).locator(".cell-body")).toHaveCSS("max-height", "none");
  await expect(page.locator("section.cell .stamp").first()).toBeVisible();
});
