import type { Metadata, Viewport } from "next";
import "highlight.js/styles/github-dark.css";
import "./globals.css";
import "./themes.css";
import { THEME_KEY, THEMES } from "@/lib/theme";

export const metadata: Metadata = {
  title: "md-notebook",
  description: "A local-only markdown scratchpad that behaves like a notebook.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0f1115",
};

// Applies the saved theme before first paint, so a light theme does not flash dark on load.
const themeScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(${JSON.stringify(
  THEMES.filter((t) => t.id !== "terminal").map((t) => t.id),
)}.indexOf(t)>=0)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The script sets data-theme before React hydrates, which React would otherwise flag.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
