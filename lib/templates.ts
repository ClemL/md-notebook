import { blankTable } from "./table";

/** One-click skeletons for the note shapes that recur: meeting summaries, tables, snippets. */

export type Template = {
  id: string;
  label: string;
  build: (now?: Date) => string;
};

function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export const TEMPLATES: Template[] = [
  {
    id: "meeting",
    label: "Meeting summary",
    build: (now = new Date()) =>
      [
        `# Meeting — ${isoDate(now)}`,
        "",
        "1. ",
        "2. ",
        "",
        "## Decisions",
        "",
        "* [ ] ",
        "",
        "## Todos",
        "",
        "* [ ] ",
        "",
      ].join("\n"),
  },
  {
    id: "scratch",
    label: "Daily scratch",
    build: (now = new Date()) => [`## ${isoDate(now)}`, "", "* [ ] ", ""].join("\n"),
  },
  {
    id: "table2",
    label: "Table 2×2",
    build: () => blankTable(2, 2),
  },
  {
    id: "table3",
    label: "Table 3×3",
    build: () => blankTable(3, 3),
  },
  {
    id: "snippet",
    label: "Code snippet",
    build: () => ["```powershell", "", "```", ""].join("\n"),
  },
  {
    id: "links",
    label: "Link list",
    build: (now = new Date()) => [`## Links — ${isoDate(now)}`, "", "- [](https://)", ""].join("\n"),
  },
];
