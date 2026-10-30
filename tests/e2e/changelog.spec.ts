import { expect, test, type Page, type Route } from "@playwright/test";

/** The footer: build info, the newest changelog entry, and the dialog listing them all. */

async function ready(page: Page) {
  await page.waitForSelector('.app[data-ready="true"]');
}

/** The served changelog, oldest first, so these tests follow whatever entries have been added. */
async function entries(page: Page): Promise<string[]> {
  const res = await page.request.get("/updates.txt");
  expect(res.ok()).toBeTruthy();
  return (await res.text())
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

const footer = (page: Page) => page.locator("footer.build-info");
const trigger = (page: Page) => page.locator(".changelog-trigger");
const dialog = (page: Page) => page.getByRole("dialog", { name: "Changelog" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await ready(page);
});

test("the footer shows build info and only the newest entry, at the foot of the page", async ({ page }) => {
  const lines = await entries(page);
  await expect(footer(page).locator("> div")).toHaveText(
    /^md-notebook · v\d+\.\d+\.\d+ · built \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/,
  );
  await expect(trigger(page)).toHaveCount(1);
  await expect(trigger(page)).toHaveText(lines[lines.length - 1]);
  await expect(trigger(page)).toHaveAttribute("title", lines[lines.length - 1]);

  // An empty notebook is shorter than the window; the footer still sits at the bottom.
  const box = (await footer(page).boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 40);
});

test("the dialog lists every entry, newest first", async ({ page }) => {
  const lines = await entries(page);
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByRole("heading")).toHaveText("Changelog");
  await expect(page.locator(".changelog-list li")).toHaveText([...lines].reverse());
});

test("only a click on the backdrop closes the dialog", async ({ page }) => {
  await trigger(page).click();
  await expect(dialog(page)).toBeVisible();

  // Clicks inside the panel must not bubble up into a dismissal.
  await page.locator(".changelog-list li").first().click();
  await expect(dialog(page)).toBeVisible();
  await page.locator(".modal").click({ position: { x: 5, y: 5 } });
  await expect(dialog(page)).toBeVisible();

  // Nor does a text selection dragged out of the panel and released over the backdrop.
  const li = (await page.locator(".changelog-list li").first().boundingBox())!;
  await page.mouse.move(li.x + 5, li.y + 5);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 4 });
  await page.mouse.up();
  await expect(dialog(page)).toBeVisible();

  await page.locator(".modal-backdrop").click({ position: { x: 5, y: 5 } });
  await expect(dialog(page)).toHaveCount(0);
});

test("the changelog opens and closes from the keyboard, and keys stay out of the notebook", async ({ page }) => {
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toBeVisible();

  // b in command mode adds an entry; typed at the dialog it must not reach the notebook.
  await page.keyboard.press("b");
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("section.cell")).toHaveCount(0);

  // Focus returns to the trigger, and Space opens it as well.
  await expect(trigger(page)).toBeFocused();
  await page.keyboard.press(" ");
  await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: /^Close/ }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test("a missing, empty or unreachable changelog leaves the build info alone, quietly", async ({ page }) => {
  const problems: string[] = [];
  page.on("pageerror", (err) => problems.push(String(err)));
  // The browser itself reports a failed request; anything else in the console came from the app.
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().startsWith("Failed to load resource")) problems.push(msg.text());
  });

  const load = async (handler: (route: Route) => Promise<void>) => {
    await page.unroute("**/updates.txt");
    await page.route("**/updates.txt", handler);
    await page.goto("/");
    await ready(page);
    await page.waitForLoadState("networkidle");
  };

  await load((route) => route.fulfill({ status: 404, body: "" }));
  await expect(footer(page).locator("> div")).toContainText("md-notebook · v");
  await expect(trigger(page)).toHaveCount(0);

  await load((route) => route.fulfill({ status: 200, contentType: "text/plain", body: "\n\n   \r\n\t\n" }));
  await expect(footer(page).locator("> div")).toContainText("md-notebook · v");
  await expect(trigger(page)).toHaveCount(0);

  await load((route) => route.abort());
  await expect(footer(page).locator("> div")).toContainText("md-notebook · v");
  await expect(trigger(page)).toHaveCount(0);

  // Windows line endings still yield the last line, without its \r.
  await load((route) => route.fulfill({ status: 200, contentType: "text/plain", body: "older\r\nnewest\r\n\r\n" }));
  await expect(trigger(page)).toHaveText("newest");

  expect(problems).toEqual([]);
});

test("entries are text, never markup", async ({ page }) => {
  await page.route("**/updates.txt", (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: '<img src=x onerror="window.pwned=1"> <b>bold</b>\n' }),
  );
  await page.goto("/");
  await ready(page);
  await expect(trigger(page)).toHaveText('<img src=x onerror="window.pwned=1"> <b>bold</b>');
  await trigger(page).click();
  await expect(page.locator(".changelog-list li")).toHaveText('<img src=x onerror="window.pwned=1"> <b>bold</b>');
  await expect(page.locator(".changelog-list img, .changelog-list b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { pwned?: number }).pwned)).toBeUndefined();
});

test("the footer is on the notebook, and off the 404 page and the printout", async ({ page }) => {
  await expect(footer(page)).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(footer(page)).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  const res = await page.goto("/no-such-page");
  expect(res!.status()).toBe(404);
  await expect(footer(page)).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const theme of ["terminal", "paper", "fluent"]) {
    test(`${theme}: the entry truncates to one line and a long changelog scrolls inside the dialog`, async ({ page }) => {
      const long = `2026-10-30T12:00:00Z - ${"An entry that runs well past the width of a phone screen. ".repeat(4).trim()}`;
      const body = [...Array.from({ length: 60 }, (_, i) => `2026-10-01T00:${String(i).padStart(2, "0")}:00Z - Entry ${i}`), long].join("\n");
      await page.route("**/updates.txt", (route) => route.fulfill({ status: 200, contentType: "text/plain", body }));
      if (theme !== "terminal") await page.evaluate((t) => localStorage.setItem("md-notebook:theme", t), theme);
      await page.goto("/");
      await ready(page);

      await expect(trigger(page)).toHaveText(long);
      const fit = await trigger(page).evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        line: parseFloat(getComputedStyle(el).lineHeight),
        truncated: el.scrollWidth > el.clientWidth,
      }));
      expect(fit.truncated).toBe(true);
      expect(fit.height).toBeLessThanOrEqual(fit.line + 1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

      await trigger(page).click();
      const panel = (await page.locator(".modal").boundingBox())!;
      expect(panel.x).toBeGreaterThanOrEqual(0);
      expect(panel.x + panel.width).toBeLessThanOrEqual(390);
      expect(panel.y + panel.height).toBeLessThanOrEqual(844);
      const list = await page.locator(".changelog-list").evaluate((el) => el.scrollHeight > el.clientHeight);
      expect(list).toBe(true);
    });
  }
});
