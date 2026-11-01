import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { bootScript } from "@/lib/boot";
import { DENSITY_KEY, LEGACY_COMPACT_KEY, TEXT_SIZE_KEY } from "@/lib/display";
import { THEME_KEY } from "@/lib/theme";

type Run = { dataset: Record<string, string>; meta: { content: string } };

/** Runs the boot script against a stand-in document, the way the browser runs it in <head>. */
function boot(stored: Record<string, string>, storage: "ok" | "getItem-throws" | "blocked" = "ok"): Run {
  const run: Run = { dataset: {}, meta: { content: "#0f1115" } };
  const localStorage = {
    getItem(key: string) {
      if (storage === "getItem-throws") throw new Error("denied");
      return key in stored ? stored[key] : null;
    },
  };
  const window =
    storage === "blocked"
      ? Object.defineProperty({}, "localStorage", {
          get: () => {
            throw new Error("SecurityError");
          },
        })
      : { localStorage };
  const document = {
    documentElement: { dataset: run.dataset },
    querySelector: () => ({ setAttribute: (_: string, value: string) => (run.meta.content = value) }),
    addEventListener: () => {},
  };
  runInNewContext(bootScript(), { window, document });
  return run;
}

describe("the boot script", () => {
  it("applies saved settings to <html>, with the theme colour", () => {
    const run = boot({ [THEME_KEY]: "oled", [DENSITY_KEY]: "cozy", [TEXT_SIZE_KEY]: "130" });
    expect(run.dataset).toEqual({ theme: "oled", density: "cozy", text: "130" });
    expect(run.meta.content).toBe("#000000");
  });

  it("sets nothing for defaults or unknown values", () => {
    expect(boot({ [THEME_KEY]: "terminal", [DENSITY_KEY]: "normal", [TEXT_SIZE_KEY]: "100" }).dataset).toEqual({});
    expect(boot({ [THEME_KEY]: "constructor", [DENSITY_KEY]: "<b>", [TEXT_SIZE_KEY]: "999" }).dataset).toEqual({});
  });

  it("reads the old Compact mode as Compact density, unless a density is saved", () => {
    expect(boot({ [LEGACY_COMPACT_KEY]: "1" }).dataset).toEqual({ density: "compact" });
    expect(boot({ [LEGACY_COMPACT_KEY]: "0" }).dataset).toEqual({});
    expect(boot({ [LEGACY_COMPACT_KEY]: "1", [DENSITY_KEY]: "cozy" }).dataset).toEqual({ density: "cozy" });
  });

  it("leaves the defaults without an error when storage throws or is blocked", () => {
    expect(boot({ [THEME_KEY]: "paper" }, "getItem-throws").dataset).toEqual({});
    expect(boot({ [THEME_KEY]: "paper" }, "blocked").dataset).toEqual({});
  });
});
