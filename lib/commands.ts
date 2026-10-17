/** An action the command palette can run. Disabled commands are listed but cannot be run. */
export type Command = {
  id: string;
  label: string;
  /** Section shown beside the label and matched by the filter: "Entry", "Table", "Notebook"… */
  group: string;
  hotkey?: string;
  disabled?: boolean;
  run: () => void;
};

/**
 * Commands matching every whitespace-separated term of the query, in group or label. Those whose
 * label starts with the query come first; otherwise the registration order is kept, which puts
 * the commonest actions near the top.
 */
export function filterCommands(commands: Command[], query: string): Command[] {
  const q = query.trim().toLowerCase();
  if (!q) return commands;
  const terms = q.split(/\s+/);
  const hits = commands.filter((c) => {
    const hay = `${c.group} ${c.label}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  });
  const leading = hits.filter((c) => c.label.toLowerCase().startsWith(q));
  return [...leading, ...hits.filter((c) => !leading.includes(c))];
}
