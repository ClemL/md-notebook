import type { NextConfig } from "next";
import { version } from "./package.json";

/**
 * STATIC_EXPORT=1 emits a self-contained site in out/ for any plain file host —
 * Azure Storage's $web container, IIS, or a synced folder opened over file://.
 * Relative asset paths are what make the file:// case work; they are harmless elsewhere.
 * Without the flag this is an ordinary Next build, so the Vercel deployment is unchanged.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

/**
 * Stamped once, when the build runs, and inlined into the bundle as a finished string, so the
 * footer shows the same text in the prerendered HTML and after hydration. Formatting a date at
 * render time would follow each machine's timezone and break hydration.
 */
const buildTime = `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  ...(staticExport
    ? {
        output: "export" as const,
        assetPrefix: "./",
        // The static build parks app/api, which the transfer unit tests import. Type checking
        // still runs on every other path: `npm run typecheck`, the default build, and CI.
        typescript: { ignoreBuildErrors: true },
      }
    : {}),
};

export default nextConfig;
