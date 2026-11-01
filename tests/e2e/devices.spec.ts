import { expect, test, type Page } from "@playwright/test";
import { DENSITY_KEY, TEXT_SIZE_KEY, layoutName } from "../../lib/display";
import { THEME_KEY, THEMES } from "../../lib/theme";

/**
 * The owner uses the notebook on a OnePlus Open, folded and unfolded, and on a Galaxy Tab S
 * Ultra. No published source gives these screens in CSS pixels, so the sizes here are the
 * panels' resolutions over a typical Android scale. The ⋯ menu shows a device's real figures
 * under "This screen"; correct these if they differ.
 */
const SCREENS = [
  { name: "OnePlus Open, folded", width: 425, height: 946, scale: 2.625 },
  { name: "OnePlus Open, unfolded", width: 864, height: 930, scale: 2.625 },
  { name: "Galaxy Tab S Ultra, portrait", width: 924, height: 1480, scale: 2 },
  { name: "Galaxy Tab S Ultra, landscape", width: 1480, height: 924, scale: 2 },
] as const;

const LONG_ENTRY = [
  "## A long entry",
  "https://dev.azure.com/inscriptrx/org/_git/a-repository-with-a-long-name?path=/src/a/very/long/path/to/a/file.cs&version=GBfeature/a-long-branch-name",
  "",
  "| Column one | Column two | Column three | Column four | Column five | Column six | Column seven |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  "| a fairly long cell value | another long cell value | 1,200.00 | 2026-11-01 | yes | no | maybe |",
  "",
  "```sql",
  "SELECT a_long_column_name, another_long_column_name, a_third_long_column_name FROM a_table_with_a_long_name WHERE 1 = 1;",
  "```",
  ...Array.from({ length: 30 }, (_, i) => `- line ${i + 1} of a list long enough to be clamped behind Show more`),
].join("\n");

async function ready(page: Page) {
  await page.waitForSelector('.app[data-ready="true"]');
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function addEntry(page: Page, text: string) {
  await page.getByRole("button", { name: /New empty entry/ }).click();
  await page.locator("textarea.editor").fill(text);
  await page.locator("textarea.editor").press("Escape");
}

/** Saves display settings the way the menu does, then reloads so they apply from the first paint. */
async function saveSettings(page: Page, settings: { theme?: string; density?: string; text?: string }) {
  await page.evaluate(
    ([keys, values]) => {
      keys.forEach((key, i) => (values[i] ? localStorage.setItem(key, values[i]) : localStorage.removeItem(key)));
    },
    [
      [THEME_KEY, DENSITY_KEY, TEXT_SIZE_KEY],
      [settings.theme ?? "", settings.density ?? "", settings.text ?? ""],
    ] as const,
  );
  await page.reload();
  await ready(page);
}

async function fresh(page: Page) {
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
      isMobile: true,
      hasTouch: true,
    });

    test("nothing scrolls sideways in any theme, at the roomiest density and largest text", async ({ page }) => {
      await fresh(page);
      await addEntry(page, LONG_ENTRY);
      for (const theme of THEMES) {
        await saveSettings(page, { theme: theme.id, density: "cozy", text: "130" });
        const more = page.getByRole("button", { name: "Show more" });
        if (await more.count()) await more.first().click();
        expect(await overflow(page), `${theme.label} overflows`).toBeLessThanOrEqual(0);
      }
    });

    test("the header's controls are on screen and the menus open within its width", async ({ page }) => {
      await fresh(page);
      for (const name of [/New entry from clipboard/, /New empty entry/, /Search entries or run a command/, /More actions/, /Insert a template/]) {
        await expect(page.getByRole("button", { name })).toBeInViewport();
      }
      for (const name of ["More actions", "Insert a template"]) {
        await page.getByRole("button", { name }).click();
        const box = (await page.locator(".menu").boundingBox())!;
        expect(box.x, `${name} runs off the left`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${name} runs off the right`).toBeLessThanOrEqual(screen.width);
        expect(box.y + box.height, `${name} runs off the bottom`).toBeLessThanOrEqual(screen.height);
        await page.keyboard.press("Escape");
      }
    });

    test("entries stay one reading column, and Wide mode uses the width", async ({ page }) => {
      await fresh(page);
      await addEntry(page, "first");
      await addEntry(page, "second");
      const [a, b] = await page
        .locator("section.cell")
        .evaluateAll((els) => els.slice(0, 2).map((el) => el.getBoundingClientRect().toJSON()));
      expect(b.top).toBeGreaterThanOrEqual(a.bottom);
      // The reading width is capped at 980px; narrower screens use all of theirs.
      expect(a.width).toBeLessThanOrEqual(Math.min(980, screen.width) - 32 + 1);
      expect(a.width).toBeGreaterThanOrEqual(Math.min(980, screen.width) - 32 - 1);

      if (screen.width > 980) {
        await page.getByRole("button", { name: "More actions" }).click();
        await page.getByText("Wide mode").click();
        await page.keyboard.press("Escape");
        const wide = await page.locator("section.cell").first().evaluate((el) => el.getBoundingClientRect().width);
        expect(wide).toBeGreaterThan(screen.width - 40);
      }
    });

    test("touch targets are at least 32px tall, and 44px with Cozy", async ({ page }) => {
      await fresh(page);
      await addEntry(page, "an entry");
      const heights = () =>
        page
          .locator("header.bar button, .cell-head button")
          .evaluateAll((els) =>
            els.filter((el) => (el as HTMLElement).offsetParent !== null).map((el) => el.getBoundingClientRect().height),
          );
      expect(Math.min(...(await heights()))).toBeGreaterThanOrEqual(32);
      await saveSettings(page, { density: "compact" });
      expect(Math.min(...(await heights()))).toBeGreaterThanOrEqual(32);
      await saveSettings(page, { density: "cozy" });
      expect(Math.min(...(await heights()))).toBeGreaterThanOrEqual(44);
    });

    test("the ⋯ menu shows this screen's size and layout", async ({ page }) => {
      await fresh(page);
      await page.getByRole("button", { name: "More actions" }).click();
      const readout = page.locator(".screen-size");
      await expect(readout).toContainText(`${screen.width} × ${screen.height} CSS pixels at ${screen.scale}×`);
      await expect(readout).toContainText(layoutName(screen.width));
    });
  });
}

test.describe("OnePlus Open, unfolding", () => {
  test.use({ viewport: { width: 425, height: 946 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });

  test("unfolding keeps the filter, the folded entries and the open menu, and the readout follows", async ({ page }) => {
    await fresh(page);
    await addEntry(page, "zebra crossing\nline two\nline three");
    await addEntry(page, "zebra stripes\nline two\nline three");
    await addEntry(page, "an unrelated entry");

    // Filter through the palette: no command matches "zebra", so the first result filters.
    await page.getByRole("button", { name: /Search entries or run a command/ }).click();
    await page.keyboard.type("zebra");
    await page.getByRole("option", { name: /Show only the 2 entries/ }).click();
    await expect(page.locator("section.cell")).toHaveCount(2);
    await page.getByRole("button", { name: /Collapse every entry/ }).click();
    await expect(page.locator("section.cell.collapsed")).toHaveCount(2);
    await page.getByRole("button", { name: "More actions" }).click();
    await expect(page.locator(".screen-size")).toContainText("425 × 946");
    await expect(page.locator(".screen-size")).toContainText("cover-screen layout");

    await page.setViewportSize({ width: 864, height: 930 });
    await expect(page.locator(".screen-size")).toContainText("864 × 930");
    await expect(page.locator(".screen-size")).toContainText("full layout");
    const box = (await page.locator(".menu").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(864);
    await page.keyboard.press("Escape");
    await expect(page.locator(".omnibox-text")).toHaveText("zebra");
    await expect(page.locator("section.cell")).toHaveCount(2);
    await expect(page.locator("section.cell.collapsed")).toHaveCount(2);
    expect(await overflow(page)).toBeLessThanOrEqual(0);
  });
});
