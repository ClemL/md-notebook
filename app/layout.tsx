import type { Metadata, Viewport } from "next";
import "highlight.js/styles/github-dark.css";
import "./globals.css";
import "./themes.css";
import { bootScript } from "@/lib/boot";
import { THEMES } from "@/lib/theme";

export const metadata: Metadata = {
  title: "md-notebook",
  description: "A local-only markdown scratchpad that behaves like a notebook.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: THEMES[0].color,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The boot script sets data-theme, data-density and data-text before React hydrates, so the
    // first paint is already right; React would otherwise flag the changed attributes.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
