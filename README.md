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

- **Blur to render.** Leaving a text box renders it; `Esc` or `Ctrl+Enter` commits without clicking away.
- **+ Paste New.** Creates an entry, drops the clipboard into it, and focuses the text box.
  If the browser blocks clipboard reads, the entry is still created and focused so `Ctrl+V` works.
- **+ Empty.** Blank entry (also `Ctrl+Shift+Enter` from anywhere).
- **Checkbox.** Prefixes every non-empty line of an entry with `* [ ] `. Idempotent — lines that are
  already tasks are left alone, and existing bullets (`- `, `1. `) are converted rather than doubled.
  **Checkbox All** applies it to every entry.
- **Copy All.** Concatenates all entries and writes them to the clipboard.
- **Export All.** Same concatenation, downloaded as `md-notebook_yyyyMMdd_HHmm.md`.
- **`---` separators toggle.** Controls whether entries are joined with a horizontal rule or just a blank line.
- Per-entry **Copy**, reorder (↑/↓), and delete (✕).

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
npm run typecheck
```

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

State is kept under the `md-notebook:v1` key in `localStorage`, scoped to the deployment's origin —
it does not sync between browsers or devices. Clearing site data clears the notebook, so use
**Export All** for anything worth keeping. If storage is full or disabled, the app keeps working
in memory for the session.
