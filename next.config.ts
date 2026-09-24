import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 emits a self-contained site in out/ for any plain file host —
 * Azure Storage's $web container, IIS, or a synced folder opened over file://.
 * Relative asset paths are what make the file:// case work; they are harmless elsewhere.
 * Without the flag this is an ordinary Next build, so the Vercel deployment is unchanged.
 */
const staticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(staticExport ? { output: "export" as const, assetPrefix: "./" } : {}),
};

export default nextConfig;
