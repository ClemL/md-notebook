# md-notebook

A notebook-style markdown scratchpad. Entries behave like `.ipynb` cells, minus execution:
type markdown, and the moment the text box loses focus it is replaced by the rendered
output with an **Edit** button that brings the text box back.

Everything lives in the browser's `localStorage` — no accounts, no server, no network calls.

## Links

- Repository: https://github.com/ClemL/md-notebook
- Vercel project: https://vercel.com/clem21/md-notebook
- Live app: https://md-notebook.vercel.app/

## Features

### Entries

- **Blur to render.** Leaving a text box renders it; `Esc` or `Ctrl+Enter` commits without clicking away.
- **+ Paste New.** Creates an entry, drops the clipboard into it, and focuses the text box. Rich
  clipboard content (Teams, Confluence, a web page) is converted to markdown; plain text is left
  alone. If the browser blocks clipboard reads, the entry is still created and focused so `Ctrl+V`
  works — and pasting into an open entry converts rich content the same way.
- **Live task checkboxes.** Ticking a rendered `* [ ]` writes `[x]` back into the markdown source.
- **Checkbox.** Prefixes every non-empty line of an entry with `* [ ] `. Idempotent — lines that are
  already tasks are left alone, and existing bullets (`- `, `1. `) are converted rather than doubled.
  **Checkbox All** applies it to every entry.
- **Timestamps** on every entry, and long entries are clamped with *Show more* so one big paste does
  not bury the rest.
- Per-entry **Copy**, reorder, and delete.

### Notebook

- **Search** (`Ctrl+K` or `/`) filters entries by substring; every term must match. While a filter is
  active, **Copy** and **Export** act on the filtered set and say so.
- **Undo / redo** (`Ctrl+Z`, `Ctrl+Shift+Z`) covers deletes, reorders, imports, checkbox conversions
  and *Delete all* — 30 steps deep. Typing collapses into one undo step per editing session.
- **Copy All** concatenates entries to the clipboard; **Export All** downloads them as
  `md-notebook_yyyyMMdd_HHmm.md`; **Backup as .json** writes a lossless file including timestamps.
- **Import.** Drag a `.md` file anywhere on the page (or use the ⋯ menu) to split it on `---` into
  entries; drop a `.json` backup to restore or append it.
- **`---` separators toggle** controls whether exported entries are joined with a horizontal rule or
  just a blank line.
- **Multi-tab safe.** A second tab's writes are adopted rather than overwritten, and an entry open
  for editing in this tab is preserved through the merge.
- **Storage warning.** If `localStorage` is full or blocked, a banner says entries are memory-only
  instead of failing silently.

### Keyboard

Every button's tooltip names its shortcut. Outside a text box the notebook is in command mode:

| Key | Action |
| --- | --- |
| `j` / `k` (or ↓ / ↑) | Move the selection |
| `Enter` / `e` | Edit the selected entry |
| `Esc` / `Ctrl+Enter` | Render the entry being edited |
| `a` / `b` | Insert an entry above / below |
| `dd` | Delete the selected entry |
| `c` | Copy the selected entry |
| `t` | Turn the selected entry's lines into tasks |
| `Alt+↑` / `Alt+↓` | Move the entry up / down |
| `/` or `Ctrl+K` | Search |
| `Ctrl+Shift+V` | New entry from the clipboard |
| `Ctrl+Shift+Enter` | New empty entry |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+S` | Export all as markdown |
| `Ctrl+Alt+C` | Copy all |

## Markdown support

GitHub Flavored Markdown via `remark-gfm`: headings, fenced code blocks (```` ``` ````) with
syntax highlighting, inline code (`` ` ``), tables, task lists, strikethrough, blockquotes, images,
and bare-URL autolinking. Single newlines render as line breaks (`remark-breaks`), which suits
pasted lists of links. Raw HTML is **not** rendered, so pasted content cannot inject markup.

## Local development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run typecheck  # tsc --noEmit
npm test           # unit tests (vitest)
npm run test:e2e   # end-to-end tests (Playwright, builds must be current)
```

`npm run test:e2e` starts its own production server on port 3123. Kill any stale `next start` first —
a server left running from an earlier build serves chunks that no longer exist and every test fails
at hydration. On a machine with a pre-installed Chromium (a sandbox, a locked-down image), set
`CHROMIUM_PATH=/path/to/chrome` instead of running `playwright install`.

CI (`.github/workflows/ci.yml`) runs typecheck, unit tests, build, and the end-to-end suite on every
push and pull request, and uploads the Playwright report when something fails.

## Deploy to Vercel

The app is a static-prerendered Next.js App Router project with no environment variables and no
server-side state, so it deploys with zero configuration.

The project is already wired up at
[vercel.com/clem21/md-notebook](https://vercel.com/clem21/md-notebook) and serves from
[md-notebook.vercel.app](https://md-notebook.vercel.app/). Pushes to the production branch deploy
automatically; other branches get preview URLs.

To set it up from scratch elsewhere:

1. Push the branch to GitHub.
2. In Vercel: **Add New → Project → Import** the repository.
3. Accept the detected framework (Next.js), build command `next build`, output `.next`.
4. Deploy.

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

## Storage notes

State is kept under the `md-notebook:v2` key in `localStorage` (a `v1` payload is migrated on first
load), scoped to the deployment's origin —
it does not sync between browsers or devices. Clearing site data clears the notebook, so use
**Export All** for anything worth keeping. If storage is full or disabled, the app keeps working
in memory for the session.
