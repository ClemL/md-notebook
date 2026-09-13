/** Pure text transforms used by the entry editor, kept out of the component so they can be tested. */

export type EditResult = { text: string; caret: number };

const LIST_MARKER = /^(\s*)(?:([-*+])|(\d+)([.)]))[ \t]+(\[[ xX]\][ \t]+)?/;

export function isUrl(value: string): boolean {
  return /^(?:https?:\/\/|mailto:)\S+$/i.test(value.trim()) && !/\s/.test(value.trim());
}

/**
 * Enter inside a list item continues the list: `- alpha` yields `- `, `* [ ] x` yields `* [ ] `,
 * and `3. x` yields `4. `. Enter on an item that has no content clears the marker instead.
 * Returns null when the caret is not in a list item, so the textarea's default Enter applies.
 */
export function continueListOnEnter(text: string, caret: number): EditResult | null {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const nextBreak = text.indexOf("\n", caret);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);

  const m = line.match(LIST_MARKER);
  if (!m) return null;

  const [prefix, indent, bullet, ordinal, delimiter, task] = m;
  const content = line.slice(prefix.length);

  // An empty item ends the list: drop the marker and leave a blank line.
  if (!content.trim()) {
    return { text: text.slice(0, lineStart) + text.slice(lineEnd), caret: lineStart };
  }

  const marker = bullet
    ? `${bullet} `
    : `${Number(ordinal) + 1}${delimiter} `;
  const insert = `\n${indent}${marker}${task ? "[ ] " : ""}`;
  return {
    text: text.slice(0, caret) + insert + text.slice(caret),
    caret: caret + insert.length,
  };
}

/** Pasting a URL over a selection produces a markdown link instead of replacing the text. */
export function wrapSelectionAsLink(
  text: string,
  start: number,
  end: number,
  url: string,
): EditResult {
  const label = text.slice(start, end).trim();
  const link = `[${label}](${url.trim()})`;
  return { text: text.slice(0, start) + link + text.slice(end), caret: start + link.length };
}

export function insertAt(text: string, start: number, end: number, insert: string): EditResult {
  return { text: text.slice(0, start) + insert + text.slice(end), caret: start + insert.length };
}

/** Split an entry at the caret; both halves are trimmed and either may be empty. */
export function splitAt(text: string, caret: number): [string, string] {
  return [text.slice(0, caret).trim(), text.slice(caret).trim()];
}

/** Join two entries with a blank line, tolerating an empty side. */
export function mergeTexts(first: string, second: string): string {
  if (!first.trim()) return second.trim();
  if (!second.trim()) return first.trim();
  return `${first.trim()}\n\n${second.trim()}`;
}
