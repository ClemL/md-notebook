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
- **Breadcrumbs paste as one line.** A link trail copied from a web app — Azure DevOps'
  `/ Boards / Sprints`, say — arrives as block elements that Turndown splits across a dozen lines,
  with the link text stranded inside `[` `]`. Those are collapsed back into
  `/ [Boards](url) / [Sprints](url)` on a single line. The rule is deliberately narrow: it needs at
  least one link, short fragments, no block markdown and no sentence punctuation, so pasted prose
  and documents keep their paragraphs.
- **Azure DevOps file links.** A file copied from a repo arrives as
  `[StorageAccount.cs](url)Org > DataDownloader.SFTP` — the link first, the location after it, led
  by the project name. It is rewritten to read as a path: `DataDownloader.SFTP >
  [StorageAccount.cs](url)`, with the account and project segments dropped. Only applies to a single
  `dev.azure.com` or `*.visualstudio.com` link followed by a `>` trail.
- **Duplicate detection.** Pasting a string that already exists verbatim jumps to that entry and
  says so instead of creating a twin; the toast offers *Add anyway*.
- **Images.** Paste or drop a screenshot anywhere to store it as an image entry: a thumbnail that
  opens full size on click, with its dimensions, size and paste time in the header. The only actions
  are **Copy** (back to the clipboard as PNG) and delete. Images are re-encoded as PNG and
  downscaled until they fit a per-image budget, because the whole notebook shares a few megabytes of
  `localStorage`. A markdown export writes a dated caption rather than a megabyte of base64 — use
  the `.json` backup to preserve the pixels.
- **Copy and export feedback.** The button whose copy or export ran most recently turns green, and
  reverts when another one is used, so it doubles as a record of what you last copied.
- **Enter continues lists.** `- alpha` + Enter gives `- `, `* [x] done` gives `* [ ] `, `3. third`
  gives `4. `, and Enter on an empty marker clears it.
- **Paste a URL over a selection** to wrap it: select `runbook`, paste, get `[runbook](url)`.
- **Split and merge.** `Ctrl+Shift+-` splits an entry at the caret; **Merge ↓** (or `Shift+M`) joins
  an entry with the one below.
- **Raw view.** `r` or the **Raw** button shows an entry's markdown source without opening the
  editor, so you can read or copy it without risking an edit.
- **Live task checkboxes.** Ticking a rendered `* [ ]` writes `[x]` back into the markdown source.
- **Checkbox.** Prefixes every non-empty line of an entry with `* [ ] `. Idempotent — lines that are
  already tasks are left alone, and existing bullets (`- `, `1. `) are converted rather than doubled.
  **Checkbox All** applies it to every entry.
- **Timestamps** on every entry, and long entries are clamped with *Show more* so one big paste does
  not bury the rest.
- **Templates** in the ⋯ menu: meeting summary (dated, with Decisions and Todos sections), daily
  scratch, code snippet, link list.
- Per-entry **Copy**, reorder, and delete.

### Notebook

- **Search** (`Ctrl+K` or `/`) filters entries by substring; every term must match. While a filter is
  active, **Copy** and **Export** act on the filtered set and say so.
- **Undo / redo** (`Ctrl+Z`, `Ctrl+Shift+Z`) covers deletes, reorders, splits, merges, imports,
  checkbox conversions and *Delete all* — 30 steps deep. Typing collapses into one undo step per
  editing session, and destructive actions put an **Undo** button in the toast.
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
| `r` | Toggle raw markdown view |
| `Shift+M` | Merge the selected entry with the one below |
| `Ctrl+Shift+-` | Split the entry being edited at the caret |
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
