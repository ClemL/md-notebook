/**
 * Copies Excalidraw's fonts into public/ so the editor works offline, on the static build and
 * behind a corporate proxy — by default it fetches them from a CDN at runtime.
 *
 * Xiaolai is skipped: it is a 13 MB CJK family, against ~0.5 MB for everything else.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const from = join(process.cwd(), "node_modules", "@excalidraw", "excalidraw", "dist", "prod", "fonts");
const to = join(process.cwd(), "public", "excalidraw-assets", "fonts");
const SKIP = new Set(["Xiaolai"]);

if (!existsSync(from)) {
  console.warn("Excalidraw fonts not found; skipping asset copy.");
  process.exit(0);
}

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, to, {
  recursive: true,
  filter: (src) => !SKIP.has(src.slice(from.length + 1).split(/[\\/]/)[0]),
});
console.log("Copied Excalidraw fonts to public/excalidraw-assets/fonts");
