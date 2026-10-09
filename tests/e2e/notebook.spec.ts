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

test("a checked task is struck through, and its unchecked sub-task is not", async ({ page }) => {
  await addEntry(page, "* [x] done\n  * [ ] open sub-task\n* [ ] open");
  const done = page.locator(".md li.task").first();
  await expect(done).toHaveClass(/\bdone\b/);
  await expect(done.locator("> .task-text")).toHaveCSS("text-decoration-line", "line-through");
  await expect(done.locator("li.task > .task-text")).toHaveCSS("text-decoration-line", "none");
  await expect(page.locator(".md li.task").last().locator("> .task-text")).toHaveCSS("text-decoration-line", "none");

  await page.locator('.md li.task input[type="checkbox"]').last().check();
  await expect(page.locator(".md li.task").last()).toHaveClass(/\bdone\b/);
});

test("the download button saves one entry as a .md file named by its size and stamp", async ({ page }) => {
  await addEntry(page, "| a | b | c |\n|---|---|---|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Download this entry/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^2×3_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.md$/);
  const fs = await import("node:fs/promises");
  expect(await fs.readFile(await download.path(), "utf8")).toContain("| 4 | 5 | 6 |");
});

test("+📋 appends entries to the clipboard with a --- rule between them", async ({ page }) => {
  await addEntry(page, "first finding");
  await addEntry(page, "second finding");
  await page.evaluate(() => navigator.clipboard.writeText("my report"));
  const buttons = page.getByRole("button", { name: /Append this entry to the clipboard/ });
  await buttons.nth(0).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("first finding");
  await buttons.nth(1).click();
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("my report\n\n---\n\n");
  expect(text.split("\n\n---\n\n")).toHaveLength(3);
  expect(text).toContain("first finding");
  expect(text).toContain("second finding");
});

test("append and checkbox buttons turn green once used, like copy", async ({ page }) => {
  await addEntry(page, "first finding");
  const cell = page.locator("section.cell").first();
  const append = cell.getByRole("button", { name: /Append this entry to the clipboard/ });
  const check = cell.getByRole("button", { name: /Prefix every line/ });
  const copy = cell.getByRole("button", { name: /Copy this entry/ });

  await append.click();
  await expect(append).toHaveAttribute("data-flash", "on");

  await check.click();
  await expect(check).toHaveAttribute("data-flash", "on");
  await expect(append).not.toHaveAttribute("data-flash", "on");

  await copy.click();
  await expect(copy).toHaveAttribute("data-flash", "on");
  await expect(check).not.toHaveAttribute("data-flash", "on");
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

  // Export All lives in the ⋯ menu; Ctrl+S still exports without opening it.
  await page.getByRole("button", { name: "More actions" }).click();
  const [md] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /^Export All/ }).click(),
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

test("an Azure DevOps breadcrumb pastes as one line of links", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  // Shape of a real breadcrumb: block wrappers inside each anchor, which Turndown splits.
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      `<div class="breadcrumb"><div class="sep">/</div><div class="item">` +
        `<a href="https://dev.azure.com/inscriptrx/Org/_workitems"><div>Boards</div></a></div>` +
        `<div class="sep">/</div><div class="item">` +
        `<a href="https://dev.azure.com/inscriptrx/Org/_sprints/directory"><div>Sprints</div></a></div></div>`,
    );
    dt.setData("text/plain", "/\nBoards\n/\nSprints");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue(
    "/ [Boards](https://dev.azure.com/inscriptrx/Org/_workitems) / [Sprints](https://dev.azure.com/inscriptrx/Org/_sprints/directory)",
  );

  await ta.press("Escape");
  await expect(page.locator(".md a")).toHaveCount(2);
  await expect(page.locator(".md a").first()).toHaveText("Boards");
  await expect(page.locator(".md p")).toHaveCount(1);
});

test("a multi-paragraph article paste keeps its paragraphs", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      "<p>The vendor feed lands at 2am and is loaded by the nightly job.</p>" +
        "<p>See <a href='https://x.test/r'>the runbook</a> for retry steps and escalation.</p>",
    );
    dt.setData("text/plain", "The vendor feed lands at 2am. See the runbook.");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue(/nightly job\.\n\nSee \[the runbook\]\(https:\/\/x\.test\/r\)/);
});

test("Enter continues list and task markers", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");

  await ta.type("- alpha");
  await ta.press("Enter");
  await ta.type("beta");
  await expect(ta).toHaveValue("- alpha\n- beta");

  await ta.press("Enter");
  await ta.press("Enter");
  await expect(ta).toHaveValue("- alpha\n- beta\n");

  await ta.fill("* [ ] first");
  await ta.press("End");
  await ta.press("Enter");
  await ta.type("second");
  await expect(ta).toHaveValue("* [ ] first\n* [ ] second");

  await ta.fill("3. third");
  await ta.press("End");
  await ta.press("Enter");
  await expect(ta).toHaveValue("3. third\n4. ");
});

test("pasting a URL over a selection makes a markdown link", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.fill("see the runbook here");
  await ta.evaluate((el: HTMLTextAreaElement) => {
    el.setSelectionRange(8, 15);
    const dt = new DataTransfer();
    dt.setData("text/plain", "https://x.test/runbook");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue("see the [runbook](https://x.test/runbook) here");
});

test("pasting the same clipboard twice jumps to the existing entry", async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText("https://x.test/duplicate"));
  await page.getByRole("button", { name: /New entry from clipboard/ }).click();
  await page.locator("textarea.editor").press("Escape");
  await expect(page.locator("section.cell")).toHaveCount(1);

  await page.getByRole("button", { name: /New entry from clipboard/ }).click();
  await expect(page.locator(".toast")).toContainText("Already saved as entry 1");
  await expect(page.locator("section.cell")).toHaveCount(1);
  await expect(page.locator("section.cell.selected")).toHaveCount(1);

  await page.getByRole("button", { name: "Add anyway" }).click();
  await expect(page.locator("section.cell")).toHaveCount(2);
});

test("deleting offers undo in the toast", async ({ page }) => {
  await addEntry(page, "delete then restore");
  await page.getByRole("button", { name: /Delete this entry/ }).click();
  await expect(page.locator("section.cell")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("section.cell")).toHaveCount(1);
  await expect(page.locator(".md")).toContainText("delete then restore");
});

test("entries split at the caret and merge with the one below", async ({ page }) => {
  await addEntry(page, "first half\n\nsecond half");
  await page.getByRole("button", { name: /Edit this entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(10, 10));
  await ta.press("Control+Shift+-");

  await expect(page.locator("section.cell")).toHaveCount(2);
  await expect(page.locator("section.cell").first()).toContainText("first half");
  await expect(page.locator("section.cell").last()).toContainText("second half");

  await page.locator("section.cell").first().getByRole("button", { name: /Merge this entry/ }).click();
  await expect(page.locator("section.cell")).toHaveCount(1);
  await page.getByRole("button", { name: /Edit this entry/ }).click();
  await expect(page.locator("textarea.editor")).toHaveValue("first half\n\nsecond half");
});

test("raw view shows the source without opening the editor", async ({ page }) => {
  await addEntry(page, "## Heading\n\n`code`");
  await page.getByRole("button", { name: /Show the markdown source/ }).click();
  await expect(page.locator("pre.raw")).toHaveText("## Heading\n\n`code`");
  await expect(page.locator("textarea.editor")).toHaveCount(0);
  await expect(page.locator(".md h2")).toHaveCount(0);

  await page.getByRole("button", { name: /Show the rendered entry/ }).click();
  await expect(page.locator(".md h2")).toHaveText("Heading");

  // The r shortcut toggles it too.
  await page.locator("section.cell").click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("r");
  await expect(page.locator("pre.raw")).toBeVisible();
});

test("templates insert a dated skeleton", async ({ page }) => {
  await page.getByRole("button", { name: "Insert a template" }).click();
  await page.getByRole("button", { name: "Meeting summary" }).click();
  const ta = page.locator("textarea.editor");
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  await expect(ta).toHaveValue(new RegExp(`# Meeting — ${iso}`));
  await expect(ta).toHaveValue(/## Decisions[\s\S]*\* \[ \]/);
});

test("an Azure DevOps file link pastes as path > link", async ({ page }) => {
  const url =
    "https://dev.azure.com/inscriptrx/Org/_git/DataDownloader.SFTP?path=/Downloader/StorageAccount.cs&_a=contents&version=GBrelease/10.0.0";
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el, href) => {
    const dt = new DataTransfer();
    dt.setData(
      "text/html",
      `<div><a href="${href}">StorageAccount.cs</a><span>Org</span><span> &gt; </span><span>DataDownloader.SFTP</span></div>`,
    );
    dt.setData("text/plain", "StorageAccount.csOrg > DataDownloader.SFTP");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, url);
  await expect(ta).toHaveValue(`DataDownloader.SFTP > [StorageAccount.cs](${url})`);
});

/** A tiny opaque PNG, built in the page so the paste carries a real image file. */
async function pasteImage(page: Page, size: [number, number] = [120, 80], count = 1) {
  await page.evaluate(async ([w, h]) => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#7cc4ff";
    ctx.fillRect(0, 0, w, h);
    const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
    const file = new File([blob], "screenshot.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, size);
  // Storing an image is asynchronous (decode, downscale, encode) and the save effect runs after
  // that, so wait for it to land rather than racing it.
  await expect(page.locator("section.cell.image-cell")).toHaveCount(count);
  await storedImage(page);
}

/** The first image entry as it sits in storage, once it is actually there. */
async function storedImage(page: Page): Promise<Record<string, string>> {
  const read = () =>
    page.evaluate(() => {
      try {
        const cells: { image?: { dataUrl?: string } }[] = JSON.parse(
          localStorage.getItem("md-notebook:v2") ?? "[]",
        );
        return cells.find((c) => c.image?.dataUrl)?.image ?? null;
      } catch {
        return null;
      }
    });
  await expect.poll(async () => ((await read())?.dataUrl?.length ?? 0)).toBeGreaterThan(0);
  return (await read()) as unknown as Record<string, string>;
}

test("a pasted image becomes an image entry without the text actions", async ({ page }) => {
  await pasteImage(page);
  const cell = page.locator("section.cell.image-cell");
  await expect(cell).toHaveCount(1);
  await expect(cell.locator("button.thumb img")).toHaveAttribute("src", /^data:image\/png;base64,/);
  await expect(cell.locator(".stamp")).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  // Dimensions and size sit on the right, just before the timestamp.
  await expect(cell.locator(".image-meta")).toHaveText(/^120×80 · \d+ (B|KB)$/);
  expect(
    await cell.locator(".image-meta").evaluate((el) => el.nextElementSibling?.classList.contains("stamp")),
  ).toBe(true);

  // Text-only actions are not offered on an image entry; moving it is.
  const labels = await cell.getByRole("button").evaluateAll((els) =>
    els.map((el) => el.getAttribute("aria-label") ?? el.textContent?.trim() ?? ""),
  );
  expect(labels.filter((l) => /Edit this|Prefix every line|Split|Raw|Send/.test(l))).toEqual([]);
  // A lone image has nothing below it to merge with.
  expect(labels.filter((l) => /Merge/.test(l))).toEqual([]);
  expect(labels.some((l) => /Move entry up/.test(l))).toBe(true);
  expect(labels.some((l) => /Move entry down/.test(l))).toBe(true);
  expect(labels.some((l) => /Copy the image/.test(l))).toBe(true);
  expect(labels.some((l) => /Delete this image/.test(l))).toBe(true);
});

test("an image entry opens full size and survives a reload", async ({ page }) => {
  await pasteImage(page);
  await page.locator("button.thumb").click();
  await expect(page.locator(".lightbox img")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".lightbox")).toHaveCount(0);

  await page.reload();
  await ready(page);
  await expect(page.locator("section.cell.image-cell button.thumb img")).toBeVisible();
});

test("an image entry exports as a caption, not base64", async ({ page }) => {
  await pasteImage(page);
  await addEntry(page, "a text entry");
  const [download] = await Promise.all([page.waitForEvent("download"), page.keyboard.press("Control+s")]);
  const body = await (await import("node:fs/promises")).readFile(await download.path(), "utf8");
  expect(body).toContain("*(image pasted");
  expect(body).not.toContain("data:image/png;base64");
  expect(body).toContain("a text entry");
});

test("copy buttons show which action ran last, and export clears them", async ({ page }) => {
  await addEntry(page, "first");
  await addEntry(page, "second");

  const entryCopy = page.locator("section.cell").first().getByRole("button", { name: /Copy this entry/ });
  await entryCopy.click();
  await expect(entryCopy).toHaveAttribute("data-flash", "on");

  const copyAll = page.getByRole("button", { name: /Copy every entry/ });
  await copyAll.click();
  await expect(copyAll).toHaveAttribute("data-flash", "on");
  await expect(entryCopy).not.toHaveAttribute("data-flash", "on");

  await page.getByRole("button", { name: "More actions" }).click();
  const exportAll = page.getByRole("button", { name: /^Export All/ });
  await Promise.all([page.waitForEvent("download"), exportAll.click()]);
  await expect(copyAll).not.toHaveAttribute("data-flash", "on");
});

test("a pipeline breadcrumb with long URLs pastes as one line", async ({ page }) => {
  const scope = "https://dev.azure.com/inscriptrx/Org/_build?definitionScope=%5CBackend%5CTSGen";
  const summary = "https://dev.azure.com/inscriptrx/Org/_build?definitionId=165&_a=summary";
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate(
    (el, urls) => {
      const dt = new DataTransfer();
      dt.setData(
        "text/html",
        `<div><div><a href="${urls.scope}"><div>TSGen</div></a></div>` +
          `<div>/</div>` +
          `<div><a href="${urls.summary}"><div>Model.CQE.Landing.Org</div></a></div></div>`,
      );
      dt.setData("text/plain", "TSGen\n/\nModel.CQE.Landing.Org");
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { scope, summary },
  );
  await expect(ta).toHaveValue(`[TSGen](${scope}) / [Model.CQE.Landing.Org](${summary})`);

  await ta.press("Escape");
  await expect(page.locator(".md p")).toHaveCount(1);
  await expect(page.locator(".md a")).toHaveCount(2);
});

test("new entries can be inserted at the top", async ({ page }) => {
  await addEntry(page, "first entry");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("New entries go to the top").click();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: /New empty entry/ }).click();
  await page.locator("textarea.editor").fill("newest entry");
  await page.locator("textarea.editor").press("Escape");

  await expect(page.locator("section.cell").first()).toContainText("newest entry");
  await expect(page.locator("section.cell").last()).toContainText("first entry");

  // The choice survives a reload.
  await page.reload();
  await ready(page);
  await page.getByRole("button", { name: /New empty entry/ }).click();
  await page.locator("textarea.editor").fill("newer still");
  await page.locator("textarea.editor").press("Escape");
  await expect(page.locator("section.cell").first()).toContainText("newer still");
});

test("an image entry cannot be merged away", async ({ page }) => {
  await addEntry(page, "text above the image");
  await pasteImage(page);
  await expect(page.locator("section.cell")).toHaveCount(2);

  // The text entry above an image offers no merge button at all.
  await expect(
    page.locator("section.cell").first().getByRole("button", { name: /Merge this entry/ }),
  ).toHaveCount(0);

  // Nor does the keyboard path swallow it.
  await page.locator("section.cell").first().click({ position: { x: 5, y: 5 } });
  await page.keyboard.press("Shift+M");
  await expect(page.locator(".toast")).toContainText("An image can only be merged with another image");
  await expect(page.locator("section.cell")).toHaveCount(2);
  await expect(page.locator("section.cell.image-cell button.thumb img")).toBeVisible();
});

test("tab-separated paste renders as a table", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "Vendor\tFeed\tOwner\nPharmaForce\tdaily\tSrini\nOptum\tweekly\tTeja");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(ta).toHaveValue(/^\| Vendor \| Feed \| Owner \|/);

  await ta.press("Escape");
  await expect(page.locator(".md table")).toHaveCount(1);
  await expect(page.locator(".md th")).toHaveCount(3);
  await expect(page.locator(".md td")).toHaveCount(6);
});

test("pipe rows missing a delimiter row are repaired on paste", async ({ page }) => {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "| Vendor | Feed |\n| Optum | weekly |");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await ta.press("Escape");
  await expect(page.locator(".md table")).toHaveCount(1);
  await expect(page.locator(".md td")).toHaveCount(2);
});

test("table templates insert a rendering skeleton", async ({ page }) => {
  await page.getByRole("button", { name: "Insert a template" }).click();
  await page.getByRole("button", { name: "Table 3×3" }).click();
  const ta = page.locator("textarea.editor");
  await expect(ta).toHaveValue(/\| Column A \| Column B \| Column C \|/);
  await ta.press("Escape");

  await expect(page.locator(".md table")).toHaveCount(1);
  await expect(page.locator(".md th")).toHaveCount(3);
  await expect(page.locator(".md tbody tr")).toHaveCount(3);
});

test("compact mode is a menu toggle that persists", async ({ page }) => {
  await addEntry(page, "an entry");
  const app = page.locator(".app");
  await expect(app).not.toHaveAttribute("data-compact", "on");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Compact mode").click();
  await page.keyboard.press("Escape");
  await expect(app).toHaveAttribute("data-compact", "on");

  // Density actually changes, not just the attribute.
  const head = page.locator(".cell-head").first();
  const compactHeight = await head.evaluate((el) => el.getBoundingClientRect().height);
  await page.reload();
  await ready(page);
  await expect(page.locator(".app")).toHaveAttribute("data-compact", "on");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Compact mode").click();
  await page.keyboard.press("Escape");
  const normalHeight = await head.evaluate((el) => el.getBoundingClientRect().height);
  expect(compactHeight).toBeLessThan(normalHeight);
});

test("wide mode is a menu toggle that persists and widens entries", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await addEntry(page, "an entry");
  const cell = page.locator("section.cell").first();
  const narrow = await cell.evaluate((el) => el.getBoundingClientRect().width);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Wide mode").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".app")).toHaveAttribute("data-wide", "on");
  const wide = await cell.evaluate((el) => el.getBoundingClientRect().width);
  expect(wide).toBeGreaterThan(narrow + 400);

  await page.reload();
  await ready(page);
  await expect(page.locator(".app")).toHaveAttribute("data-wide", "on");
});

test("text entries show their line count and tables their rows × columns", async ({ page }) => {
  await addEntry(page, "one\ntwo\nthree");
  await addEntry(page, "| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
  const cells = page.locator("section.cell");
  await expect(cells.nth(0).locator(".cell-meta")).toHaveText("3 lines");
  await expect(cells.nth(1).locator(".cell-meta")).toHaveText("2×3");
  await expect(cells.nth(1).locator(".cell-meta")).toHaveAttribute("title", "2 rows × 3 columns");
  expect(
    await cells.nth(0).locator(".cell-meta").evaluate((el) => el.nextElementSibling?.classList.contains("stamp")),
  ).toBe(true);
});

test("the hint line can be dismissed and brought back", async ({ page }) => {
  await expect(page.locator("p.hint")).toBeVisible();
  await page.getByRole("button", { name: "Hide the shortcut hints" }).click();
  await expect(page.locator("p.hint")).toHaveCount(0);

  await page.reload();
  await ready(page);
  await expect(page.locator("p.hint")).toHaveCount(0);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Show the shortcut hints").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("p.hint")).toBeVisible();
});

test("an entry collapses to two lines and remembers it", async ({ page }) => {
  await addEntry(page, "line one\nline two\nline three\nline four\nline five\nline six");
  const cell = page.locator("section.cell").first();
  const body = cell.locator(".cell-body");
  const full = await body.evaluate((el) => el.getBoundingClientRect().height);

  await cell.getByRole("button", { name: /Collapse to the first two lines/ }).click();
  await expect(cell).toHaveClass(/collapsed/);
  await expect(cell.locator(".collapsed-chip")).toHaveText("+4 lines");
  const collapsed = await body.evaluate((el) => el.getBoundingClientRect().height);
  expect(collapsed).toBeLessThan(full / 2);
  expect(collapsed).toBeLessThan(60);

  await page.reload();
  await ready(page);
  await expect(page.locator("section.cell").first()).toHaveClass(/collapsed/);

  await page.locator("section.cell").first().getByRole("button", { name: /Expand this entry/ }).click();
  await expect(page.locator("section.cell").first()).not.toHaveClass(/collapsed/);
  await expect(page.locator(".collapsed-chip")).toHaveCount(0);
});

test("an image entry collapses away its thumbnail", async ({ page }) => {
  await pasteImage(page);
  const cell = page.locator("section.cell.image-cell");
  await expect(cell.locator("button.thumb img")).toBeVisible();

  await cell.getByRole("button", { name: /Collapse this image/ }).click();
  await expect(cell).toHaveClass(/collapsed/);
  await expect(cell.locator("button.thumb img")).toBeHidden();
  await expect(cell.locator(".image-meta")).toBeVisible();

  await cell.getByRole("button", { name: /Expand this image/ }).click();
  await expect(cell.locator("button.thumb img")).toBeVisible();
});

test.describe("touch device (foldable, phone)", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

  test("nothing depends on hover and tap targets are big enough", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);

    await page.getByRole("button", { name: /New empty entry/ }).tap();
    await page.locator("textarea.editor").fill("```sql\nSELECT 1;\n```");
    await page.locator("textarea.editor").press("Escape");

    // The code copy button is reachable without a hover state.
    const copy = page.getByRole("button", { name: "Copy code block" });
    await expect(copy).toHaveCSS("opacity", "1");
    await copy.tap();
    await expect(copy).toHaveText("copied");

    // Hover tooltips do not exist on touch, where they would stick after a tap.
    await expect(page.locator(".tipwrap .tip").first()).toBeHidden();

    // Toolbar buttons clear the small-target threshold.
    const tiny = await page.locator("header.bar button, .cell-head button").evaluateAll((els) =>
      els.filter((el) => el.getBoundingClientRect().height < 38).length,
    );
    expect(tiny).toBe(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("no toolbar control is clipped off the edge of the screen", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);

    await page.getByRole("button", { name: /New empty entry/ }).tap();
    await page.locator("textarea.editor").fill("## Heading\nline two\nline three\nline four");
    await page.locator("textarea.editor").press("Escape");
    await page.getByRole("button", { name: /New empty entry/ }).tap();
    await page.locator("textarea.editor").fill("a second entry");
    await page.locator("textarea.editor").press("Escape");
    await page.locator("section.cell").first().getByRole("button", { name: /Collapse to/ }).tap();

    // The page does not scroll sideways, so anything past the edge is simply unreachable.
    const clipped = await page.locator(".cell-head button, .collapsed-chip, header.bar button").evaluateAll(
      (els, width) =>
        els
          .filter((el) => {
            const r = el.getBoundingClientRect();
            return r.right > width + 1 || r.left < -1;
          })
          .map((el) => (el.getAttribute("aria-label") ?? el.textContent ?? "").trim()),
      412,
    );
    expect(clipped).toEqual([]);
  });

  test("hiding the hint and going compact frees real estate", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: /New empty entry/ }).tap();
    await page.locator("textarea.editor").fill("an entry");
    await page.locator("textarea.editor").press("Escape");

    const top = () => page.locator("section.cell").first().evaluate((el) => el.getBoundingClientRect().top);
    const before = await top();

    await page.getByRole("button", { name: "Hide the shortcut hints" }).tap();
    await page.getByRole("button", { name: "More actions" }).tap();
    await page.getByText("Compact mode").tap();
    await page.keyboard.press("Escape");

    const after = await top();
    expect(after).toBeLessThan(before - 100);
  });
});

test("templates live in their own dropdown, separate from the actions menu", async ({ page }) => {
  await page.getByRole("button", { name: "Insert a template" }).click();
  await expect(page.getByRole("button", { name: "Meeting summary" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Table 2×2" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete all entries" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "More actions" }).click();
  await expect(page.getByRole("button", { name: "Backup as .json" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Meeting summary" })).toHaveCount(0);

  // An action closes the menu; an option leaves it open so several can be set at once.
  await page.getByText("Compact mode").click();
  await expect(page.getByRole("button", { name: "Backup as .json" })).toBeVisible();
  await page.getByText("New entries go to the top").click();
  await expect(page.getByRole("button", { name: "Backup as .json" })).toBeVisible();
  await page.getByRole("button", { name: "Checkbox All" }).click();
  await expect(page.getByRole("button", { name: "Backup as .json" })).toHaveCount(0);
});

test.describe("dropdowns on a short screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 480 } });

  test("every menu stays on screen and scrolls to its last item", async ({ page }) => {
    await page.goto("/");
    await ready(page);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await ready(page);

    for (const name of ["More actions", "Insert a template"]) {
      await page.getByRole("button", { name }).tap();
      const menu = page.locator(".menu");
      const box = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, scrolls: el.scrollHeight > el.clientHeight };
      });
      expect(box.left, `${name} runs off the left`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${name} runs off the right`).toBeLessThanOrEqual(412);
      expect(box.bottom, `${name} runs off the bottom`).toBeLessThanOrEqual(480);

      // Whatever does not fit must be reachable by scrolling the menu itself, since an
      // overlay cannot be brought into view by scrolling the page behind it.
      if (box.scrolls) {
        await menu.evaluate((el) => el.scrollTo(0, el.scrollHeight));
        const last = await menu.locator("button").last().evaluate((el) => el.getBoundingClientRect().bottom);
        expect(last).toBeLessThanOrEqual(480);
      }
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
    }
  });
});

/* ------------------------------------------------------------ image editors */

/** Drags a shape across the annotator canvas in image coordinates. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.locator(".annotation-layer.editing").boundingBox())!;
  await page.mouse.move(box.x + from[0], box.y + from[1]);
  await page.mouse.down();
  await page.mouse.move(box.x + to[0], box.y + to[1], { steps: 8 });
  await page.mouse.up();
}

/** Edit opens the annotator in the entry; Full screen moves it to the whole window. */
async function openFullEditor(page: Page) {
  await page.getByRole("button", { name: /, in the entry/ }).click();
  await page.getByRole("button", { name: "Full screen ⤢" }).click();
  await expect(page.locator(".editor-overlay")).toBeVisible();
}

test("Full screen carries unsaved inline shapes into the window editor", async ({ page }) => {
  await pasteImage(page);
  await page.getByRole("button", { name: /, in the entry/ }).click();
  // No separate Draw button any more: the full editor is an option inside Edit.
  await expect(page.getByRole("button", { name: /^Draw/ })).toHaveCount(0);
  await drag(page, [10, 10], [80, 50]);
  await expect(page.locator(".editor-inline .annotation-layer.editing rect")).toHaveCount(1);

  await page.getByRole("button", { name: "Full screen ⤢" }).click();
  await expect(page.locator(".editor-inline")).toHaveCount(0);
  await expect(page.locator(".editor-overlay .annotation-layer.editing rect")).toHaveCount(1);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("section.cell .annotation-layer rect")).toHaveCount(1);
});

test("the built-in annotator stores shapes beside the image, not in it", async ({ page }) => {
  await pasteImage(page);
  const before = (await storedImage(page)).dataUrl;

  await openFullEditor(page);
  await expect(page.locator(".annotation-layer.editing")).toBeVisible();

  // The editor opens on the box tool; switch to arrows for the first shape.
  await page.keyboard.press("a");
  await drag(page, [10, 10], [80, 50]);
  await page.keyboard.press("r");
  await drag(page, [20, 30], [90, 60]);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  // Rendered over the thumbnail, and the pixels are untouched.
  await expect(page.locator("section.cell .annotation-layer")).toHaveCount(1);
  await expect(page.locator("section.cell .annotation-layer line")).toHaveCount(1);
  await expect(page.locator("section.cell .annotation-layer rect")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Edit the 2 arrows and boxes/ })).toHaveText("Edit");

  const after = await storedImage(page);
  expect(after.dataUrl).toBe(before);
  expect(after.annotations).toHaveLength(2);

  // The whole edit is one undo step.
  await page.keyboard.press("Control+z");
  await expect(page.locator("section.cell .annotation-layer")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator("section.cell .annotation-layer line")).toHaveCount(1);

  // And it survives a reload (undo history does not, by design).
  await page.reload();
  await ready(page);
  await expect(page.locator("section.cell .annotation-layer line")).toHaveCount(1);
  await expect(page.locator("section.cell .annotation-layer rect")).toHaveCount(1);
});

test("annotations can be undone, cleared and cancelled inside the editor", async ({ page }) => {
  await pasteImage(page);
  await openFullEditor(page);
  await page.keyboard.press("a");
  await drag(page, [10, 10], [80, 50]);
  await drag(page, [20, 20], [70, 60]);
  await expect(page.locator(".annotation-layer.editing line")).toHaveCount(2);

  // Scoped to the editor: the paste toast carries an Undo button of its own.
  const editor = page.getByRole("dialog", { name: "Annotate image" });
  await editor.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".annotation-layer.editing line")).toHaveCount(1);
  await editor.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(".annotation-layer.editing line")).toHaveCount(0);

  await drag(page, [10, 10], [80, 50]);
  await editor.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".editor-overlay")).toHaveCount(0);
  await expect(page.locator("section.cell .annotation-layer")).toHaveCount(0);
});

test("a stray tap does not become an annotation", async ({ page }) => {
  await pasteImage(page);
  await openFullEditor(page);
  await drag(page, [40, 40], [42, 41]);
  await expect(page.locator(".annotation-layer.editing line")).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("Excalidraw hands the image to the clipboard and opens in its own window", async ({ page, context }) => {
  await pasteImage(page);
  await page.evaluate(() => navigator.clipboard.writeText("not an image"));

  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.getByRole("button", { name: /open Excalidraw in a new window/ }).click(),
  ]);
  // The sandbox cannot reach the site, but the navigation target is what matters.
  expect(popup.url() === "about:blank" || popup.url().includes("excalidraw") || popup.url().startsWith("chrome-error")).toBe(true);
  await popup.close();

  await expect(page.locator(".toast")).toContainText("Image copied");
  const types = await page.evaluate(async () => (await navigator.clipboard.read())[0]?.types ?? []);
  expect(types).toContain("image/png");

  // Nothing is embedded any more: no editor opens in the notebook itself.
  await expect(page.locator(".editor-overlay")).toHaveCount(0);
});

test("the annotator uses Excalidraw's tool keys", async ({ page }) => {
  await pasteImage(page);
  await openFullEditor(page);
  const active = page.locator(".editor-bar button[aria-pressed='true']:not(.swatch)");

  for (const [key, label] of [
    ["r", "Box"],
    ["2", "Box"],
    ["a", "Arrow"],
    ["5", "Arrow"],
    ["l", "Line"],
    ["6", "Line"],
    ["t", "Text"],
    ["8", "Text"],
  ] as const) {
    await page.keyboard.press(key);
    await expect(active, `key ${key} should select ${label}`).toContainText(label);
  }

  // A bare letter typed at the editor must not reach the notebook's own shortcuts behind it.
  await expect(page.locator("pre.raw")).toHaveCount(0);
  await expect(page.locator(".editor-overlay")).toBeVisible();

  // Only the four tools are offered; the rest are left to Excalidraw.
  const tools = await page
    .locator(".editor-bar button[aria-pressed]:not(.swatch)")
    .allTextContents();
  expect(tools.map((t) => t.trim().split(" ")[0])).toEqual(["Box", "Arrow", "Line", "Text"]);
});

test("the Text tool drops a label, and Ctrl+Z / Ctrl+Shift+Z step through it", async ({ page }) => {
  await pasteImage(page);
  await openFullEditor(page);
  const box = (await page.locator(".annotation-layer.editing").boundingBox())!;

  await page.keyboard.press("t");
  await page.mouse.click(box.x + 60, box.y + 40);
  await page.locator("#annotation-text").fill("retry this job");
  await page.keyboard.press("Enter");
  await expect(page.locator(".annotation-layer.editing text")).toHaveText("retry this job");

  await page.keyboard.press("Control+z");
  await expect(page.locator(".annotation-layer.editing text")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(page.locator(".annotation-layer.editing text")).toHaveCount(1);

  // Escape while typing abandons the label rather than the whole editor.
  await page.mouse.click(box.x + 90, box.y + 70);
  await page.locator("#annotation-text").fill("never mind");
  await page.keyboard.press("Escape");
  await expect(page.locator("#annotation-text")).toHaveCount(0);
  await expect(page.locator(".editor-overlay")).toBeVisible();
  await expect(page.locator(".annotation-layer.editing text")).toHaveCount(1);

  // Ctrl+Enter saves, like committing an entry.
  await page.keyboard.press("Control+Enter");
  await expect(page.locator(".editor-overlay")).toHaveCount(0);
  await expect(page.locator("section.cell .annotation-layer text")).toHaveCount(1);
});

test("Edit marks the image up inside the entry", async ({ page }) => {
  await pasteImage(page);
  await page.getByRole("button", { name: /, in the entry/ }).click();

  // In the entry, not over the whole window, and in place of the thumbnail.
  await expect(page.locator("section.cell .editor-inline")).toHaveCount(1);
  await expect(page.locator(".editor-overlay")).toHaveCount(0);
  await expect(page.locator("section.cell button.thumb")).toHaveCount(0);

  const box = (await page.locator(".annotation-layer.editing").boundingBox())!;
  await page.keyboard.press("2");
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 90, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press("Control+Enter");

  await expect(page.locator(".editor-inline")).toHaveCount(0);
  await expect(page.locator("section.cell button.thumb")).toHaveCount(1);
  await expect(page.locator("section.cell .annotation-layer rect")).toHaveCount(1);

  // The button toggles, and cancelling leaves the entry as it was.
  await page.getByRole("button", { name: /, in the entry/ }).click();
  await expect(page.locator(".editor-inline")).toHaveCount(1);
  await page.getByRole("button", { name: /, in the entry/ }).click();
  await expect(page.locator(".editor-inline")).toHaveCount(0);
  await expect(page.locator("section.cell .annotation-layer rect")).toHaveCount(1);
});

test("annotations drawn by an older version still render", async ({ page }) => {
  await pasteImage(page);
  // Ellipse and freehand were dropped from the palette; anything already drawn must survive.
  await page.evaluate(() => {
    const cells = JSON.parse(localStorage.getItem("md-notebook:v2")!);
    cells[0].image.annotations = [
      { id: "a", kind: "ellipse", x1: 20, y1: 20, x2: 200, y2: 160, color: "#ffc93c" },
      {
        id: "b",
        kind: "freedraw",
        x1: 0,
        y1: 0,
        x2: 0,
        y2: 0,
        color: "#8ce0a6",
        points: [[10, 300], [60, 320], [120, 300]],
      },
    ];
    localStorage.setItem("md-notebook:v2", JSON.stringify(cells));
  });
  await page.reload();
  await ready(page);

  await expect(page.locator("section.cell .annotation-layer ellipse")).toHaveCount(1);
  await expect(page.locator("section.cell .annotation-layer polyline")).toHaveCount(1);
});

/* ------------------------------------------------------------ ADO URL paste */

test("a bare Azure DevOps URL pastes as a link naming what it points at", async ({ page }) => {
  const pr = "https://dev.azure.com/inscriptrx/Org/_git/Model.Landing.Optum/pullrequest/2865";
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el, url) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", url);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, pr);

  await expect(ta).toHaveValue(`[Model.Landing.Optum PR !2865](${pr})`);
  await ta.press("Escape");
  await expect(page.locator(`.md a[href="${pr}"]`)).toHaveText("Model.Landing.Optum PR !2865");
});

test("a pasted work-item list leads each line with its state", async ({ page }) => {
  const url = (id: number) => `https://dev.azure.com/inscriptrx/Org/_workitems/edit/${id}`;
  const a = `[1897 Removed most recent RxSense file from blob storage](${url(1897)})`;
  const b = `[1898 Onboard @Alyssa Hewson, start date 9/28](${url(1898)})`;
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, `\n\n${a}Blocked\n\n${b}Resolved\n\n`);

  await expect(ta).toHaveValue(`\`blocked\` ${a}\n\n\`resolved\` ${b}`);
  await ta.press("Escape");
  await expect(page.locator(".md p").first().locator("code")).toHaveText("blocked");
  await expect(page.locator(`.md a[href="${url(1898)}"]`)).toHaveText("1898 Onboard @Alyssa Hewson, start date 9/28");
});

test("a dev.azure.com URL of no recognized shape is left to the browser", async ({ page }) => {
  const plain = "https://dev.azure.com/inscriptrx/Org/_build/results?buildId=1403";
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");

  // dispatchEvent returns false when a handler called preventDefault. Nothing claims this paste,
  // so the browser inserts the bare URL itself and the entry autolinks it on render.
  const claimed = await ta.evaluate((el, url) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", url);
    return !el.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }),
    );
  }, plain);

  expect(claimed).toBe(false);
  await expect(ta).toHaveValue("");
});

/* ------------------------------------------- image views, moves and merges; table tools */

test("an image can be shown as a thumbnail, fit to width, or 1:1", async ({ page }) => {
  await pasteImage(page, [1200, 300]);
  const cell = page.locator("section.cell.image-cell");
  const img = cell.locator("button.thumb img");
  const size = () => img.evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));
  const entryWidth = await cell.locator(".cell-body").evaluate((el) => el.clientWidth);

  // Thumbnail by default: narrower than the entry.
  await expect(cell.getByRole("button", { name: "Show a small thumbnail" })).toHaveAttribute("aria-pressed", "true");
  expect((await size()).w).toBeLessThan(entryWidth);

  await cell.getByRole("button", { name: /Fit the image to the width/ }).click();
  await expect.poll(async () => (await size()).w).toBeGreaterThan(entryWidth - 40);

  // Fit to height is not offered.
  await expect(cell.getByRole("button", { name: /height/ })).toHaveCount(0);

  await cell.getByRole("button", { name: /original size/ }).click();
  await expect.poll(async () => size()).toEqual({ w: 1200, h: 300 });

  // The choice is kept with the entry, but is not an undoable edit.
  await page.reload();
  await ready(page);
  await expect(
    page.locator("section.cell.image-cell").getByRole("button", { name: /original size/ }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("the menu sets every image, and new pastes, to one size", async ({ page }) => {
  await pasteImage(page, [1200, 300]);
  const pressed = (name: RegExp) =>
    page.locator("section.cell.image-cell").getByRole("button", { name });
  await expect(pressed(/small thumbnail/).first()).toHaveText("Tbn");

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("group", { name: "All images" }).getByRole("button", { name: "Fit W" }).click();
  await expect(pressed(/Fit the image to the width/).first()).toHaveAttribute("aria-pressed", "true");

  await pasteImage(page, [200, 100], 2);
  await expect(pressed(/Fit the image to the width/).nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await ready(page);
  await expect(pressed(/Fit the image to the width/)).toHaveCount(2);
  for (const i of [0, 1]) {
    await expect(pressed(/Fit the image to the width/).nth(i)).toHaveAttribute("aria-pressed", "true");
  }
});

test("an image entry downloads as a .png", async ({ page }) => {
  await pasteImage(page, [120, 80]);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("section.cell.image-cell").getByRole("button", { name: /Download this image/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^120x80_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.png$/);
  const fs = await import("node:fs/promises");
  const bytes = await fs.readFile(await download.path());
  expect(bytes.subarray(1, 4).toString()).toBe("PNG");
});

test("image entries move up and down like any other entry", async ({ page }) => {
  await addEntry(page, "text entry");
  await pasteImage(page);
  const order = () =>
    page.locator("section.cell").evaluateAll((els) => els.map((el) => (el.classList.contains("image-cell") ? "img" : "txt")));
  expect(await order()).toEqual(["txt", "img"]);

  const image = page.locator("section.cell.image-cell");
  await expect(image.getByRole("button", { name: /Move entry down/ })).toBeDisabled();
  await image.getByRole("button", { name: /Move entry up/ }).click();
  expect(await order()).toEqual(["img", "txt"]);
});

test("two adjacent images merge into one, stacked, keeping their annotations", async ({ page }) => {
  await pasteImage(page, [120, 80], 1);
  await pasteImage(page, [100, 50], 2);
  const images = page.locator("section.cell.image-cell");

  // Only the upper image offers the merge; the lower has nothing below it.
  await expect(images.nth(0).getByRole("button", { name: /Merge with the image below/ })).toHaveCount(1);
  await expect(images.nth(1).getByRole("button", { name: /Merge with the image below/ })).toHaveCount(0);

  await images.nth(0).getByRole("button", { name: /Merge with the image below/ }).click();
  await expect(images).toHaveCount(1);
  await expect(page.locator(".toast")).toContainText("120×130");

  const merged = await images.locator("button.thumb img").evaluate((el) => {
    const img = el as HTMLImageElement;
    return { w: img.naturalWidth, h: img.naturalHeight };
  });
  expect(merged).toEqual({ w: 120, h: 130 });

  // One undo step brings both back.
  await page.keyboard.press("Control+z");
  await expect(images).toHaveCount(2);
});

test("an image does not offer to merge with a text entry", async ({ page }) => {
  await pasteImage(page);
  await addEntry(page, "text below");
  // New entries land at the bottom, so the image is first and text follows it.
  await expect(page.locator("section.cell.image-cell").getByRole("button", { name: /Merge/ })).toHaveCount(0);
});

test("the annotator opens on the box tool", async ({ page }) => {
  await pasteImage(page);
  await page.getByRole("button", { name: /, in the entry/ }).click();
  await expect(page.locator(".editor-bar button[aria-pressed='true']:not(.swatch)")).toContainText("Box");
});

test("an entry that is only a table can be sorted by column and lose a column", async ({ page }) => {
  await addEntry(page, "| Name | Qty |\n| --- | ---: |\n| pear | 10 |\n| apple | 2 |\n| fig | 33 |");
  const rows = () => page.locator(".md tbody tr td:first-child").allTextContents();
  expect(await rows()).toEqual(["pear", "apple", "fig"]);

  await page.getByRole("button", { name: "Sort by column 1" }).click();
  expect(await rows()).toEqual(["apple", "fig", "pear"]);
  await page.getByRole("button", { name: "Sort by column 1, descending" }).click();
  expect(await rows()).toEqual(["pear", "fig", "apple"]);

  // Numbers sort as numbers, not as text.
  await page.getByRole("button", { name: "Sort by column 2" }).click();
  expect(await page.locator(".md tbody tr td:nth-child(2)").allTextContents()).toEqual(["2", "10", "33"]);

  await page.getByRole("button", { name: "Delete column 1" }).click();
  await expect(page.locator(".md thead th")).toHaveCount(1);
  await expect(page.locator(".md thead th")).toContainText("Qty");
  // The last column cannot be deleted.
  await expect(page.getByRole("button", { name: /Delete column/ })).toHaveCount(0);

  // Each change is an undo step.
  await page.keyboard.press("Control+z");
  await expect(page.locator(".md thead th")).toHaveCount(2);
});

test("a table inside other text gets no table tools", async ({ page }) => {
  await addEntry(page, "Notes first\n\n| a | b |\n| - | - |\n| 1 | 2 |");
  await expect(page.locator(".md table")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Sort by column/ })).toHaveCount(0);
});

test("collapse all folds every entry, and expands them again", async ({ page }) => {
  await addEntry(page, "one\ntwo\nthree\nfour");
  await addEntry(page, "five\nsix\nseven");
  await page.getByRole("button", { name: /Collapse every entry/ }).click();
  await expect(page.locator("section.cell.collapsed")).toHaveCount(2);
  await page.getByRole("button", { name: /Expand every entry/ }).click();
  await expect(page.locator("section.cell.collapsed")).toHaveCount(0);
});

test("compact mode keeps timestamps and shortens the Excalidraw label", async ({ page }) => {
  await pasteImage(page);
  const xcd = page.getByRole("button", { name: /open Excalidraw in a new window/ });
  // innerText, because both labels are in the DOM and CSS shows one of them.
  await expect(xcd).toHaveText("Excalidraw ↗", { useInnerText: true });

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByText("Compact mode").click();
  await page.keyboard.press("Escape");

  await expect(xcd).toHaveText("Xcd ↗", { useInnerText: true });
  await expect(page.locator("section.cell .stamp")).toBeVisible();
});

test("header labels: + Paste and a checkbox emoji", async ({ page }) => {
  await expect(page.locator("header.bar .title")).toHaveText("mdnb");
  await expect(page.getByRole("button", { name: /New entry from clipboard/ })).toHaveText("+ Paste");
  await addEntry(page, "a line");
  await expect(page.getByRole("button", { name: /Prefix every line/ })).toHaveText("☑️");
});

test("the search box shrinks before the header wraps", async ({ page }) => {
  const header = page.locator("header.bar");
  const search = page.locator(".search");
  await page.setViewportSize({ width: 1280, height: 800 });
  const wide = (await search.boundingBox())!.width;
  const oneLine = (await header.boundingBox())!.height;

  // Narrower window: the search box has given up width and the header is still one line.
  await page.setViewportSize({ width: 940, height: 800 });
  const narrow = (await search.boundingBox())!.width;
  expect(narrow).toBeLessThan(wide);
  expect(narrow).toBeGreaterThanOrEqual(120);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(oneLine + 1);
});

test("a pasted work item URL becomes a Story link, with the comment when there is one", async ({ page }) => {
  const paste = async (url: string) => {
    await page.getByRole("button", { name: /New empty entry/ }).click();
    const ta = page.locator("textarea.editor");
    await ta.evaluate((el, u) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", u);
      el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
    }, url);
    return ta;
  };

  const story = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1973/?view=edit";
  let ta = await paste(story);
  await expect(ta).toHaveValue(`[Story 1973](${story})`);
  await ta.press("Escape");
  await expect(page.locator(`.md a[href="${story}"]`)).toHaveText("Story 1973");

  const comment = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1973#16306064";
  ta = await paste(comment);
  await expect(ta).toHaveValue(`[Story 1973 / Comment 16306064](${comment})`);
  await ta.press("Escape");

  const wiki = "https://dev.azure.com/inscriptrx/Org/_wiki/wikis/ScriptWellRx.wiki/1140/2026-10-02-Sprint-Review-60";
  ta = await paste(wiki);
  await expect(ta).toHaveValue(`[2026 10 02 Sprint Review 60](${wiki})`);
});

test("+ Paste labels Azure DevOps links too, plain or as an Edge friendly link", async ({ page }) => {
  const viaPasteButton = async () => {
    await page.getByRole("button", { name: /New entry from clipboard/ }).click();
    const ta = page.locator("textarea.editor");
    const value = await ta.inputValue();
    await ta.press("Escape");
    return value;
  };

  const comment = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1968#16302017";
  await page.evaluate((u) => navigator.clipboard.writeText(u), comment);
  expect(await viaPasteButton()).toBe(`[Story 1968 / Comment 16302017](${comment})`);

  const story = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1895/?view=edit";
  await page.evaluate((u) => navigator.clipboard.writeText(u), story);
  expect(await viaPasteButton()).toBe(`[Story 1895](${story})`);

  // Edge "friendly link": the URL only in the HTML flavor, the page title as plain text.
  const edge = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1900";
  await page.evaluate(async (u) => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob([`<a href="${u}">Story 1900: Fix the loader - Boards</a>`], { type: "text/html" }),
        "text/plain": new Blob(["Story 1900: Fix the loader - Boards"], { type: "text/plain" }),
      }),
    ]);
  }, edge);
  expect(await viaPasteButton()).toBe(`[Story 1900](${edge})`);
});

test("an Edge friendly link pasted into an open entry gets the Story label", async ({ page }) => {
  const url = "https://dev.azure.com/inscriptrx/Org/_workitems/edit/1968#16302017";
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el, u) => {
    const dt = new DataTransfer();
    dt.setData("text/html", `<a href="${u}">Bug 1968: Loader times out - Boards</a>`);
    dt.setData("text/plain", "Bug 1968: Loader times out - Boards");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, url);
  await expect(ta).toHaveValue(`[Story 1968 / Comment 16302017](${url})`);

  // HTML carrying more than the one link is a document, and converts as usual.
  await ta.fill("");
  await ta.evaluate((el, u) => {
    const dt = new DataTransfer();
    dt.setData("text/html", `<p>See <a href="${u}">the bug</a> before release.</p>`);
    dt.setData("text/plain", "See the bug before release.");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, url);
  await expect(ta).toHaveValue(`See [the bug](${url}) before release.`);
});

test("a pasted CSV becomes a table with the first row as its header", async ({ page }) => {
  const csv = [
    '"ServerName","ResourceGroup","Location","DatabaseName","Edition","Sku","ElasticPool","Status","BackupRedundancy","PitrDays","DiffBackupHours","LtrWeekly","LtrMonthly","LtrYearly","LtrWeekOfYear","LtrBackupCount","Flag_LowPitr","Flag_NoLtr","Error"',
    '"bilhinscriptprod2","BILH","centralus","Prod","BusinessCritical","BC_Gen5",,"Online","Geo","7","12","P8W","P26W","P52W","1",,"False","False",',
    '"bilhinscripttest2","BILH","centralus","Test","GeneralPurpose","GP_Gen5",,"Online","Geo","7","12","P4W","P8W","Off",,,"False","False",',
    '"orginscriptprod2","Org","centralus","Prod","GeneralPurpose","GP_Gen5",,"Online","Geo","7","12","P4W","P8W","Off",,,"False","False",',
  ].join("\n");

  // Into an open entry.
  await page.getByRole("button", { name: /New empty entry/ }).click();
  const ta = page.locator("textarea.editor");
  await ta.evaluate((el, text) => {
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, csv);
  await expect(ta).toHaveValue(/^\| ServerName \| ResourceGroup \|/);
  await ta.press("Escape");

  const table = page.locator("section.cell .md table").first();
  await expect(table.locator("thead th")).toHaveCount(19);
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table.locator("thead th").first()).toContainText("ServerName");
  await expect(table.locator("tbody tr").first().locator("td").nth(5)).toHaveText("BC_Gen5");
  // It is a table entry like any other, so the sort tools are there.
  await expect(page.getByRole("button", { name: "Sort by column 1", exact: true })).toHaveCount(1);

  // Through + Paste as well.
  await page.evaluate((text) => navigator.clipboard.writeText(text), csv.replace("Prod", "Prod2"));
  await page.getByRole("button", { name: /New entry from clipboard/ }).click();
  await expect(page.locator("textarea.editor")).toHaveValue(/^\| ServerName \| ResourceGroup \|/);
});
