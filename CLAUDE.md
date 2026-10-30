# md-notebook

A local-only markdown scratchpad built with Next.js (App Router). `README.md` is the feature
reference and the guide to running, testing and hosting it.

## Working agreements

* **Add a line to `public/updates.txt` when you ship a user-visible change.** Newest last; the footer reads the file and shows the final line. Internal changes (refactors, tests, tooling) do not get a line.
* **Describe user-visible changes in `README.md`** as well, in the section for that part of the app.
* **Run the checks CI runs before pushing:** `npm run typecheck`, `npm test`, `npm run build` and
  `npm run test:e2e`.
