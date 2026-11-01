/**
 * Density sets how much space surrounds things; text size sets how large the letters are. They
 * are separate so that larger text does not also mean fewer entries on screen. Both are
 * attributes on <html>, applied before first paint by the boot script (lib/boot.ts).
 */
export const DENSITIES = [
  { id: "compact", label: "Compact", tip: "Tighter spacing and type, more on screen" },
  { id: "normal", label: "Normal", tip: "The default spacing" },
  { id: "cozy", label: "Cozy", tip: "Roomier spacing and larger touch targets" },
] as const;

export const TEXT_SIZES = [
  { id: "90", label: "90%" },
  { id: "100", label: "100%" },
  { id: "115", label: "115%" },
  { id: "130", label: "130%" },
] as const;

export type DensityId = (typeof DENSITIES)[number]["id"];
export type TextSizeId = (typeof TEXT_SIZES)[number]["id"];

export const DENSITY_KEY = "md-notebook:density";
export const TEXT_SIZE_KEY = "md-notebook:text-size";
/** The old on/off Compact mode; read once so a saved "1" becomes Compact density. */
export const LEGACY_COMPACT_KEY = "md-notebook:compact";

export function isDensityId(value: unknown): value is DensityId {
  return DENSITIES.some((d) => d.id === value);
}

export function isTextSizeId(value: unknown): value is TextSizeId {
  return TEXT_SIZES.some((t) => t.id === value);
}

export function applyDensity(density: DensityId): void {
  if (density === "normal") delete document.documentElement.dataset.density;
  else document.documentElement.dataset.density = density;
}

export function applyTextSize(size: TextSizeId): void {
  if (size === "100") delete document.documentElement.dataset.text;
  else document.documentElement.dataset.text = size;
}

/**
 * The widths globals.css lays out by. A folded OnePlus Open (about 425px) gets the cover-screen
 * layout; the unfolded one (about 864px) and a Galaxy Tab S Ultra (924px portrait, 1480px
 * landscape) get the full one. Keep these in step with the media queries.
 */
export const COVER_MAX_WIDTH = 460;
export const WRAP_MAX_WIDTH = 820;

/** The layout the stylesheet chose for this window, for the screen readout. */
export function layoutName(width: number): string {
  if (width <= COVER_MAX_WIDTH) return "cover-screen layout";
  if (width <= WRAP_MAX_WIDTH) return "narrow layout, toolbars wrap";
  return "full layout";
}
