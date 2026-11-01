/**
 * The looks offered under ⋯ → Theme. Terminal is the original and needs no attribute.
 * `color` is the browser's theme colour (the Android address bar), matching the header bar.
 */
export const THEMES = [
  { id: "terminal", label: "Terminal", tip: "Dark and monospace: the original look", color: "#0f1115" },
  { id: "paper", label: "Paper", tip: "Light, serif reading text, toolbars shown only where you work", color: "#f6f3ec" },
  { id: "fluent", label: "Fluent", tip: "Dark, Segoe UI, styled after Microsoft Teams", color: "#141414" },
  { id: "daylight", label: "Daylight", tip: "Light and plain, in the system sans-serif", color: "#f6f8fa" },
  { id: "oled", label: "OLED", tip: "True black for AMOLED screens, with dimmed text", color: "#000000" },
  { id: "contrast", label: "High contrast", tip: "Black on white, strong borders and focus rings", color: "#ffffff" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_KEY = "md-notebook:theme";

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** Sets the theme on <html>, where portalled menus and the palette inherit it too. */
export function applyTheme(theme: ThemeId): void {
  if (theme === "terminal") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  const color = THEMES.find((t) => t.id === theme)?.color;
  if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", color);
}
