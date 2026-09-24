/**
 * Cross-platform wrapper for the static export, so the same command works in PowerShell,
 * cmd and bash: `npm run build:static`.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, STATIC_EXPORT: "1" },
});

process.exit(result.status ?? 1);
