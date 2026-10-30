/**
 * The entries of public/updates.txt: one per line, oldest first. Lines are trimmed, which also
 * drops the \r of a file saved with Windows line endings, and blank lines are skipped, so an
 * empty or whitespace-only file yields no entries rather than a blank one.
 */
export function parseChangelog(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
