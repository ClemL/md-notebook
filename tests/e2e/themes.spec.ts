import { expect, test, type Page } from "@playwright/test";

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

const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test("the theme is a menu setting that survives a reload", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  const terminal = await bodyBackground(page);

  await page.getByRole("button", { name: "More actions" }).click();
  const group = page.getByRole("group", { name: "Theme" });
  await expect(group.getByRole("button", { name: "Terminal" })).toHaveAttribute("aria-pressed", "true");
  await group.getByRole("button", { name: "Paper" }).click();
  await expect(html).toHaveAttribute("data-theme", "paper");
  // Choosing closes the menu, as the image-size row does; reopened, it marks the choice.
  await page.getByRole("button", { name: "More actions" }).click();
  await expect(group.getByRole("button", { name: "Paper" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  expect(await bodyBackground(page)).toBe("rgb(246, 243, 236)");

  // Applied before hydration on the next load, so there is no dark flash.
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "paper");
  await ready(page);

  // The command palette switches it too, and Terminal removes the attribute.
  await page.keyboard.press("p");
  await page.keyboard.type("theme fluent");
  await page.keyboard.press("Enter");
  await expect(html).toHaveAttribute("data-theme", "fluent");
  await page.keyboard.press("p");
  await page.keyboard.type("theme terminal");
  await page.keyboard.press("Enter");
  await expect(html).not.toHaveAttribute("data-theme", /.+/);
  expect(await bodyBackground(page)).toBe(terminal);
});

test("printing ignores the theme", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("md-notebook:theme", "fluent"));
  await page.reload();
  await ready(page);
  await page.emulateMedia({ media: "print" });
  expect(await bodyBackground(page)).toBe("rgb(255, 255, 255)");
});

for (const theme of ["paper", "fluent"]) {
  test(`${theme} does not scroll sideways at phone width`, async ({ page }) => {
    await page.evaluate((t) => localStorage.setItem("md-notebook:theme", t), theme);
    await page.setViewportSize({ width: 400, height: 800 });
    await page.reload();
    await ready(page);
    await page.getByRole("button", { name: /New empty entry/ }).click();
    await page.locator("textarea.editor").fill("| a | b | c |\n| - | - | - |\n| 1 | 2 | 3 |");
    await page.locator("textarea.editor").press("Escape");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
