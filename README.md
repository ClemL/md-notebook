# md-notebook

A notebook-style markdown scratchpad. Entries behave like `.ipynb` cells, minus execution:
type markdown, and the moment the text box loses focus it is replaced by the rendered
output with an **Edit** button that brings the text box back.

Everything lives in the browser's `localStorage` — no accounts, no sign-in, no sync. The one
exception is **Send/Receive**, an opt-in hand-off that moves an entry to another machine through a
short-lived key in Upstash Redis; it is the only part of the app that needs environment variables
and a serverless function, and the app runs fine with it unconfigured.

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
- **Azure DevOps URLs pasted bare.** A `dev.azure.com` URL pasted on its own — from the address
  bar, where there is no rich clipboard flavor to convert — becomes a link labelled with what it
  points at. Four shapes are recognized, and the pull-request shape is checked first:

  | Pasted URL | Becomes |
  | --- | --- |
  | `…/_git/{repo}/pullrequest/{n}` | `[{repo} PR !{n}](url)` |
  | `…/_git/{repo}?version=GB{branch}&path=/{file}` | `[{branch} / {file}](url)` |
  | `…/_git/{repo}?path=/{file}` | `[{file}](url)` |
  | `…/_wiki/wikis/{wiki}/{id}/{page}` | `[{page}](url)` |

  Branch names and file paths are URL-decoded, so `GBfeature%2F1403` reads as `feature/1403`, and
  `version` and `path` are read by name rather than position. As narrow as the breadcrumb rule:
  the paste has to be nothing but the URL, and anything else — a `GT` tag, a `GC` commit, a work
  item, a bare project URL, a URL sitting inside a sentence — is left exactly as pasted.
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
  scratch, 2×2 and 3×3 table skeletons, code snippet, link list.
- **Tabular paste becomes a table.** Markdown tables render on their own; what does not is text that
  only looks tabular. A tab-separated grid (Excel, a query result) is converted to a markdown table
  on paste, and pipe rows written without the `| --- |` delimiter row GFM requires have it inserted.
- **Image entries are never merged.** Merging is offered only between two text entries, so an image
  cannot be silently discarded into an entry's markdown.
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
- **New entries go to the top** (⋯ menu) puts new, pasted, templated and imported entries above the
  existing ones instead of below. `a` and `b` still insert relative to the selected entry.
- **Extra compact** (⋯ menu, off by default) drops the centered 980px column so the notebook runs
  edge to edge in the window. Only the outer page box changes — entries keep their own padding.
- **Show keyboard hint** (⋯ menu, on by default) controls the shortcut line under the header. Off
  removes it from the document rather than hiding it, so it reserves no space.
- **Send / Receive.** Ad hoc, write-once transfer of an entry between machines, for when the
  notebook on the laptop has something the notebook on the desktop needs. **Send** (`s`, or the
  button in an entry's toolbar) uploads that entry's markdown and copies a 7-character code to the
  clipboard. **Receive** (`g`, or the ⋯ menu) takes the code on the other machine and inserts the
  content as new entries — at the top if that option is on, otherwise below the selected entry,
  and as one undo step like any import. The read is a Redis `GETDEL`, so a code works exactly
  once; an unclaimed transfer expires after 24 hours. There is no history, no re-claiming and no
  account: if nobody receives it, it is gone. Image entries cannot be sent.
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
| `s` | Send the selected entry, and copy its transfer code |
| `g` | Receive a transfer by code |
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
cp .env.local.example .env.local   # optional: only Send/Receive needs it
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

The app is a static-prerendered Next.js App Router project. Send/Receive is the one deviation: it
needs two environment variables and ships a single serverless function (`/api/transfer`, plus its
`[code]` child) to keep the Upstash token off the client — every other route is still static, and
without the variables the app behaves exactly as before, with Send and Receive reporting that
transfer is not set up.

### Environment variables

| Variable | Where it comes from |
| --- | --- |
| `UPSTASH_REDIS_REST_URL` | Upstash console → your database → REST API |
| `UPSTASH_REDIS_REST_TOKEN` | same page; this is a secret and must not be prefixed `NEXT_PUBLIC_` |

Set both in **Vercel → Project → Settings → Environment Variables** for Production, Preview and
Development. Locally they go in `.env.local` (gitignored); `.env.local.example` documents them.

### Transfer API

| Route | Does |
| --- | --- |
| `POST /api/transfer` | Body `{ entries: string[] }`. Mints a code, writes `transfer:<code>` with `SET … EX 86400 NX`, answers `{ code }`. |
| `GET /api/transfer/<code>` | `GETDEL transfer:<code>`. Answers `{ entries }`, or 404 `{ error: "not_found" }` when the code expired or was already used. |

Both answer 503 `not_configured` when the environment variables are missing and 502 `upstream`
when Upstash is unreachable, so the browser can give each failure its own message. The token is
read only inside the route handlers (`lib/upstash.ts`) and never reaches the client bundle.

The project is already wired up at
[vercel.com/clem21/md-notebook](https://vercel.com/clem21/md-notebook) and serves from
[md-notebook.vercel.app](https://md-notebook.vercel.app/). Pushes to the production branch deploy
automatically; other branches get preview URLs.

To set it up from scratch elsewhere:

1. Push the branch to GitHub.
2. In Vercel: **Add New → Project → Import** the repository.
3. Accept the detected framework (Next.js), build command `next build`, output `.next`.
4. Add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, or skip them and leave
   Send/Receive switched off.
5. Deploy.

Or from the CLI:

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production deployment
```

## Storage notes

Apart from a pending Send — one `transfer:<code>` key in Redis, deleted the moment it is
received and expiring after 24h regardless — state is kept under the `md-notebook:v2` key in `localStorage` (a `v1` payload is migrated on first
load), scoped to the deployment's origin —
it does not sync between browsers or devices. Clearing site data clears the notebook, so use
**Export All** for anything worth keeping. If storage is full or disabled, the app keeps working
in memory for the session.
