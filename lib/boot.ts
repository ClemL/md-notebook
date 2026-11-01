import { DENSITIES, DENSITY_KEY, LEGACY_COMPACT_KEY, TEXT_SIZES, TEXT_SIZE_KEY } from "./display";
import { THEMES, THEME_KEY } from "./theme";

/**
 * The inline script in <head> that applies the saved display settings before first paint: the
 * theme (and the browser's theme colour), density and text size. Without it the page would
 * paint in the defaults and jump once React read localStorage.
 *
 * Every value is checked against an allowlist built from the same lists the menu uses, so a
 * stale or tampered value applies nothing. Each setting is read on its own, so one that throws
 * costs only itself.
 */
export function bootScript(): string {
  const themes = THEMES.filter((t) => t.id !== "terminal").map((t) => t.id);
  const colors = Object.fromEntries(THEMES.map((t) => [t.id, t.color]));
  const densities = DENSITIES.filter((d) => d.id !== "normal").map((d) => d.id);
  const sizes = TEXT_SIZES.filter((t) => t.id !== "100").map((t) => t.id);
  const json = JSON.stringify;
  return [
    "(function(){var d=document.documentElement,s;",
    "try{s=window.localStorage}catch(e){return}",
    "function g(k){try{return s.getItem(k)}catch(e){return null}}",
    `var t=g(${json(THEME_KEY)});if(${json(themes)}.indexOf(t)>=0){d.dataset.theme=t;`,
    // The theme-color meta tag comes after this script in <head>, so try again once it is parsed.
    `var c=${json(colors)}[t],m=function(){var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute('content',c)};`,
    "m();document.addEventListener('DOMContentLoaded',m)}",
    `var n=g(${json(DENSITY_KEY)});if(n===null&&g(${json(LEGACY_COMPACT_KEY)})==='1')n='compact';`,
    `if(${json(densities)}.indexOf(n)>=0)d.dataset.density=n;`,
    `var z=g(${json(TEXT_SIZE_KEY)});if(${json(sizes)}.indexOf(z)>=0)d.dataset.text=z;`,
    "})()",
  ].join("");
}
