/** The project's agent selection guide, relative to the project root. */
export const WORKSPACE_GUIDE_PATH = ".traycer/agent-selection-guide.md";

/**
 * The guide with `note` added as its own paragraph at the end, or `null` when
 * the guide already holds it. The rest of the file is kept as it is.
 */
export function guideWithNote(guide: string, note: string): string | null {
  const paragraph = note.trim();
  if (paragraph.length === 0 || guide.includes(paragraph)) return null;
  if (guide.length === 0) return `${paragraph}\n`;
  const lineEnding = guide.includes("\r\n") ? "\r\n" : "\n";
  const body = paragraph.replace(/\r?\n/g, lineEnding);
  let separator = lineEnding.repeat(2);
  if (guide.endsWith(lineEnding.repeat(2))) separator = "";
  else if (guide.endsWith(lineEnding)) separator = lineEnding;
  return `${guide}${separator}${body}${lineEnding}`;
}
