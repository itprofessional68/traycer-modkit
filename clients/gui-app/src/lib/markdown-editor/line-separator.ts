export type LineSeparator = "\r\n" | "\r" | "\n";

/**
 * The file's dominant line ending. The editor splits lines on this one only
 * and joins them back with it, so saving a CRLF or lone-CR file never rewrites
 * its line endings. A file with no line break, or a tie, takes `\n`.
 */
export function detectLineSeparator(text: string): LineSeparator {
  let crlf = 0;
  let cr = 0;
  let lf = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (code === 10) {
      lf += 1;
    }
  }
  if (crlf > lf && crlf >= cr) return "\r\n";
  if (cr > lf && cr > crlf) return "\r";
  return "\n";
}

/**
 * Rewrites every line break in `text` as `lineBreak`, so text pasted or
 * dropped into a file takes that file's line endings instead of mixing in the
 * clipboard's.
 */
export function normalizeLineBreaks(text: string, lineBreak: string): string {
  return text.replace(/\r\n|\r|\n/g, lineBreak);
}
