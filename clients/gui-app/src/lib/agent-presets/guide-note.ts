/** The project's agent selection guide, relative to the project root. */
export const WORKSPACE_GUIDE_PATH = ".traycer/agent-selection-guide.md";

/**
 * The guide with `note` added as its own paragraph at the end, or `null` when
 * the guide already holds it. The rest of the file is kept as it is.
 */
export function guideWithNote(guide: string, note: string): string | null {
  const paragraph = note.trim();
  if (paragraph.length === 0 || guideHasParagraphs(guide, paragraph)) {
    return null;
  }
  if (guide.length === 0) return `${paragraph}\n`;
  const lineEnding = guide.includes("\r\n") ? "\r\n" : "\n";
  const body = paragraph.replace(/\r?\n/g, lineEnding);
  let separator = lineEnding.repeat(2);
  if (guide.endsWith(lineEnding.repeat(2))) separator = "";
  else if (guide.endsWith(lineEnding)) separator = lineEnding;
  return `${guide}${separator}${body}${lineEnding}`;
}

/**
 * Whether the guide holds the note's paragraphs as whole, consecutive
 * paragraphs of its own: a sentence that merely appears inside a longer
 * paragraph, or in a heading, is not the note.
 */
function guideHasParagraphs(guide: string, note: string): boolean {
  const guideParagraphs = paragraphsOf(guide);
  const noteParagraphs = paragraphsOf(note);
  return guideParagraphs.some((_, start) =>
    noteParagraphs.every(
      (paragraph, offset) => guideParagraphs[start + offset] === paragraph,
    ),
  );
}

/**
 * The text's paragraphs: blocks between blank lines, with a Markdown heading
 * line its own block, as Markdown reads a heading with no blank line under it.
 */
function paragraphsOf(text: string): ReadonlyArray<string> {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .flatMap(splitOffHeadings)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function splitOffHeadings(block: string): ReadonlyArray<string> {
  const parts: Array<string> = [];
  let lines: Array<string> = [];
  for (const line of block.split("\n")) {
    if (/^ {0,3}#{1,6}(\s|$)/.test(line)) {
      parts.push(lines.join("\n"), line);
      lines = [];
    } else {
      lines.push(line);
    }
  }
  parts.push(lines.join("\n"));
  return parts;
}
