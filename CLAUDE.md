# md-notebook

A local-only markdown scratchpad built with Next.js (App Router). `README.md` is the feature
reference and the guide to running, testing and hosting it.

## Working agreements

* **Add a line to `public/updates.txt` when you ship a user-visible change.** Newest last; the footer reads the file and shows the final line. Internal changes (refactors, tests, tooling) do not get a line.
* **Describe user-visible changes in `README.md`** as well, in the section for that part of the app.
* **Run the checks CI runs before pushing:** `npm run typecheck`, `npm test`, `npm run build` and
  `npm run test:e2e`.
* **Check UI work at the four device sizes**: OnePlus Open folded (425×946) and unfolded
  (864×930), Galaxy Tab S Ultra portrait (924×1480) and landscape (1480×924).
  `tests/e2e/devices.spec.ts` runs them; if a real device reports other figures (the ⋯ menu shows
  them under "This screen"), correct the tests.

## Things that will bite you

* **Display settings are applied before first paint** by the inline script `lib/boot.ts` builds:
  theme (and the `theme-color` meta tag), density and text size. Its allowlists come from the lists
  in `lib/theme.ts` and `lib/display.ts`, so adding a theme is a list entry plus its block in
  `app/themes.css`. Changing how a setting is stored means changing the script too;
  `tests/unit/boot.test.ts` runs it in a sandbox.
* **Every px font size is `calc(<n>px * var(--text-scale))`**, or the Text size setting skips it.
  Spacing for Compact and Cozy lives in the `[data-density=…]` blocks in `app/globals.css`; a new
  control that should grow for fingers belongs in the Cozy block's selector list.
* **Header menus use `app/Dropdown.tsx`.** Never position a menu absolutely inside the header: its
  `backdrop-filter` makes the header the containing block for fixed descendants. A row of settings
  inside a menu carries `data-keep-open`, so choosing one does not close the menu.

