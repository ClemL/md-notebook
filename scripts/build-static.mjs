/**
 * Builds the self-contained static site in out/.
 *
 * Send/Receive needs server routes, which a static file host cannot run, and Next refuses to
 * export a build containing them. They are moved aside for the duration of the build and put
 * back afterwards, so the static copy is everything except transfer; the app tells the user as
 * much if they try to send from it.
 *
 * Cross-platform on purpose: the same `npm run build:static` works in PowerShell, cmd and bash.
 */
import { existsSync, renameSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const api = join(root, "app", "api");
const parked = join(root, "app", "_api.static-build");

let moved = false;
if (existsSync(api)) {
  renameSync(api, parked);
  moved = true;
  console.log("Static build: Send/Receive routes excluded (a file host cannot run them).");
}

try {
  const result = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, STATIC_EXPORT: "1" },
  });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally {
  if (moved) renameSync(parked, api);
}
