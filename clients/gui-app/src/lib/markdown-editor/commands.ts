import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type TransactionSpec,
} from "@codemirror/state";

export type MarkdownInlineFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strikethrough"
  | "inlineCode";

export type MarkdownLineFormat =
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "numberedList"
  | "taskList"
  | "quote";

const INLINE_MARKERS: Record<
  MarkdownInlineFormat,
  { readonly before: string; readonly after: string }
> = {
  bold: { before: "**", after: "**" },
  // `_` rather than `*`, so italic and bold never read each other's markers
  // when toggling off.
  italic: { before: "_", after: "_" },
  // Markdown has no underline; the preview renders the HTML tag.
  underline: { before: "<u>", after: "</u>" },
  strikethrough: { before: "~~", after: "~~" },
  inlineCode: { before: "`", after: "`" },
};

const HEADING_LEVEL: Partial<Record<MarkdownLineFormat, number>> = {
  heading1: 1,
  heading2: 2,
  heading3: 3,
};

// Indent, then at most one block prefix: heading, quote, task, bullet or
// numbered item. Task is listed before bullet so `- [ ] ` is read whole.
const LINE_PREFIX = /^(\s*)(#{1,6} |> ?|[-*+] \[[ xX]\] |[-*+] |\d+[.)] )?/;

type LinePrefixKind = "heading" | "quote" | "task" | "bullet" | "numbered";

function prefixKind(prefix: string): LinePrefixKind | null {
  if (prefix === "") return null;
  if (prefix.startsWith("#")) return "heading";
  if (prefix.startsWith(">")) return "quote";
  if (/^[-*+] \[/.test(prefix)) return "task";
  if (/^[-*+] /.test(prefix)) return "bullet";
  return "numbered";
}

/**
 * Wraps each selection in the format's markers, or removes them when the
 * selection (or the text right around it) already carries them. An empty
 * selection gets an empty pair with the caret between the markers.
 */
export function toggleInlineFormat(
  state: EditorState,
  format: MarkdownInlineFormat,
): TransactionSpec {
  const { before, after } = INLINE_MARKERS[format];
  return {
    ...state.changeByRange((range) => {
      const selected = state.sliceDoc(range.from, range.to);
      if (
        selected.length >= before.length + after.length &&
        selected.startsWith(before) &&
        selected.endsWith(after)
      ) {
        const inner = selected.slice(
          before.length,
          selected.length - after.length,
        );
        return {
          changes: { from: range.from, to: range.to, insert: inner },
          range: EditorSelection.range(range.from, range.from + inner.length),
        };
      }
      const outerFrom = range.from - before.length;
      const outerTo = range.to + after.length;
      if (
        outerFrom >= 0 &&
        outerTo <= state.doc.length &&
        state.sliceDoc(outerFrom, range.from) === before &&
        state.sliceDoc(range.to, outerTo) === after
      ) {
        return {
          changes: [
            { from: outerFrom, to: range.from, insert: "" },
            { from: range.to, to: outerTo, insert: "" },
          ],
          range: EditorSelection.range(outerFrom, range.to - before.length),
        };
      }
      return {
        changes: [
          { from: range.from, insert: before },
          { from: range.to, insert: after },
        ],
        range: EditorSelection.range(
          range.from + before.length,
          range.to + before.length,
        ),
      };
    }),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

/**
 * Sets the block prefix of every line the selection touches. When every
 * touched line already has the requested prefix it is removed instead, so the
 * same button turns a heading, list or quote off. Indentation is kept.
 */
export function toggleLineFormat(
  state: EditorState,
  format: MarkdownLineFormat,
): TransactionSpec {
  const lines = touchedLines(state);
  const headingLevel = HEADING_LEVEL[format];
  const requested =
    headingLevel === undefined ? null : `${"#".repeat(headingLevel)} `;
  const parsed = lines.map((line) => {
    const match = LINE_PREFIX.exec(line.text);
    const indent = match?.[1] ?? "";
    const prefix = match?.[2] ?? "";
    return { line, indent, prefix, kind: prefixKind(prefix) };
  });
  const wantKind = lineFormatKind(format);
  const allHave = parsed.every((entry) =>
    requested === null ? entry.kind === wantKind : entry.prefix === requested,
  );
  const changes: ChangeSpec[] = [];
  let ordinal = 1;
  for (const entry of parsed) {
    const from = entry.line.from + entry.indent.length;
    const to = from + entry.prefix.length;
    let insert: string;
    if (allHave) {
      insert = "";
    } else if (requested !== null) {
      insert = requested;
    } else {
      insert = newPrefix(format, ordinal);
      ordinal += 1;
    }
    if (state.sliceDoc(from, to) !== insert) {
      changes.push({ from, to, insert });
    }
  }
  const changeSet = state.changes(changes);
  return {
    changes: changeSet,
    // A caret where a prefix goes in lands after it, ready to type.
    selection: state.selection.map(changeSet, 1),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

function lineFormatKind(format: MarkdownLineFormat): LinePrefixKind {
  switch (format) {
    case "heading1":
    case "heading2":
    case "heading3":
      return "heading";
    case "bulletList":
      return "bullet";
    case "numberedList":
      return "numbered";
    case "taskList":
      return "task";
    case "quote":
      return "quote";
  }
}

function newPrefix(format: MarkdownLineFormat, ordinal: number): string {
  switch (format) {
    case "bulletList":
      return "- ";
    case "numberedList":
      return `${ordinal}. `;
    case "taskList":
      return "- [ ] ";
    case "quote":
      return "> ";
    case "heading1":
    case "heading2":
    case "heading3":
      return `${"#".repeat(HEADING_LEVEL[format] ?? 1)} `;
  }
}

/**
 * The distinct lines under every selection range, in document order. A
 * multi-line selection skips blank lines so a list does not get empty items;
 * a caret on a blank line still counts, so a list can start there.
 */
function touchedLines(
  state: EditorState,
): ReadonlyArray<{ readonly from: number; readonly text: string }> {
  const seen = new Set<number>();
  const result: Array<{ readonly from: number; readonly text: string }> = [];
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const end = state.doc.lineAt(range.to);
    // A selection ending at the very start of a line (a triple-click) does
    // not include that line.
    const last =
      range.to > range.from && range.to === end.from && end.number > first
        ? end.number - 1
        : end.number;
    for (let number = first; number <= last; number += 1) {
      if (seen.has(number)) continue;
      seen.add(number);
      const line = state.doc.line(number);
      if (first !== last && line.text.trim() === "") continue;
      result.push({ from: line.from, text: line.text });
    }
  }
  return result.sort((a, b) => a.from - b.from);
}

/**
 * A link around the selection with the URL selected for typing, or a
 * placeholder label selected when nothing is selected.
 */
export function insertLink(
  state: EditorState,
  kind: "link" | "image",
): TransactionSpec {
  const bang = kind === "image" ? "!" : "";
  const placeholderLabel = kind === "image" ? "alt text" : "link text";
  const url = "https://";
  return {
    ...state.changeByRange((range) => {
      const selected = state.sliceDoc(range.from, range.to);
      const label = selected === "" ? placeholderLabel : selected;
      const insert = `${bang}[${label}](${url})`;
      const labelFrom = range.from + bang.length + 1;
      const selection =
        selected === ""
          ? EditorSelection.range(labelFrom, labelFrom + label.length)
          : EditorSelection.range(
              labelFrom + label.length + 2,
              labelFrom + label.length + 2 + url.length,
            );
      return {
        changes: { from: range.from, to: range.to, insert },
        range: selection,
      };
    }),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

export type MarkdownBlock =
  | { readonly kind: "codeBlock"; readonly language: string }
  | { readonly kind: "table" }
  | { readonly kind: "horizontalRule" };

/**
 * Inserts a block on lines of its own at the main selection, adding the line
 * breaks needed to separate it from surrounding text. A selection becomes the
 * body of a code block.
 */
export function insertBlock(
  state: EditorState,
  block: MarkdownBlock,
): TransactionSpec {
  const main = state.selection.main;
  // A selection ending at the very start of a line (a triple-click) stops
  // before that line's break.
  const range =
    main.to > main.from && state.doc.lineAt(main.to).from === main.to
      ? EditorSelection.range(main.from, main.to - 1)
      : main;
  const lineBreak = state.lineBreak;
  const selected = state.sliceDoc(range.from, range.to);
  const before = state.doc.lineAt(range.from);
  const after = state.doc.lineAt(range.to);
  const textBefore = state.sliceDoc(before.from, range.from);
  const textAfter = state.sliceDoc(range.to, after.to);
  // A block needs a blank line between it and any text around it: `---`
  // right under a paragraph turns that paragraph into a heading, and a text
  // line right under a table becomes one of its rows. Document positions
  // count a line break as one, however the file spells it.
  const leadBreaks = breaksToSeparate(
    textBefore,
    before.number > 1 ? state.doc.line(before.number - 1).text : "",
  );
  const trailBreaks = breaksToSeparate(
    textAfter,
    after.number < state.doc.lines ? state.doc.line(after.number + 1).text : "",
  );

  const bodyLines = blockLines(block, selected, lineBreak);
  const insert =
    lineBreak.repeat(leadBreaks) +
    bodyLines.lines.join(lineBreak) +
    lineBreak.repeat(trailBreaks);
  const caret =
    range.from + leadBreaks + offsetOf(bodyLines.lines, bodyLines.caret);
  return {
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.cursor(caret),
    scrollIntoView: true,
    userEvent: "input.format",
  };
}

/**
 * Line breaks to put between a block and its neighbour: two when text shares
 * the block's line, one when the line beside it holds text, none otherwise.
 */
function breaksToSeparate(sameLine: string, adjacentLine: string): number {
  if (sameLine.trim() !== "") return 2;
  if (adjacentLine.trim() !== "") return 1;
  return 0;
}

function blockLines(
  block: MarkdownBlock,
  selected: string,
  lineBreak: string,
): {
  readonly lines: readonly string[];
  readonly caret: { readonly line: number; readonly column: number };
} {
  switch (block.kind) {
    case "codeBlock": {
      const fence = `\`\`\`${block.language}`;
      if (selected === "") {
        return { lines: [fence, "", "```"], caret: { line: 1, column: 0 } };
      }
      const inner = selected.split(lineBreak);
      return {
        lines: [fence, ...inner, "```"],
        caret: { line: inner.length + 1, column: 3 },
      };
    }
    case "table":
      return {
        lines: [
          "| Column 1 | Column 2 | Column 3 |",
          "| --- | --- | --- |",
          "|  |  |  |",
          "|  |  |  |",
        ],
        caret: { line: 2, column: 2 },
      };
    case "horizontalRule":
      return { lines: ["---"], caret: { line: 0, column: 3 } };
  }
}

function offsetOf(
  lines: readonly string[],
  caret: { readonly line: number; readonly column: number },
): number {
  let offset = 0;
  for (let index = 0; index < caret.line; index += 1) {
    offset += (lines[index] ?? "").length + 1;
  }
  return offset + caret.column;
}

/** Replaces every selection with `text` and puts the caret after it. */
export function insertText(state: EditorState, text: string): TransactionSpec {
  return {
    ...state.replaceSelection(text),
    scrollIntoView: true,
    userEvent: "input",
  };
}
