/** The looks offered under ⋯ → Theme. Terminal is the original and needs no attribute. */
export const THEMES = [
  { id: "terminal", label: "Terminal", tip: "Dark and monospace: the original look" },
  { id: "paper", label: "Paper", tip: "Light, serif reading text, toolbars shown only where you work" },
  { id: "fluent", label: "Fluent", tip: "Dark, Segoe UI, styled after Microsoft Teams" },
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
}
