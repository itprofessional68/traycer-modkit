import {
  EditorSelection,
  EditorState,
  type TransactionSpec,
} from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  insertBlock,
  insertLink,
  insertText,
  toggleInlineFormat,
  toggleLineFormat,
} from "@/lib/markdown-editor/commands";

/**
 * A state from `text` where `«` and `»` mark the selection (removed from the
 * doc) and `‸` marks a caret. Positions are string offsets, so the doc must
 * use `\n` line breaks.
 */
function stateOf(text: string, lineSeparator: string | undefined): EditorState {
  let doc = text;
  let anchor: number;
  let head: number;
  const caret = doc.indexOf("‸");
  if (caret !== -1) {
    doc = doc.slice(0, caret) + doc.slice(caret + 1);
    anchor = caret;
    head = caret;
  } else {
    anchor = doc.indexOf("«");
    doc = doc.slice(0, anchor) + doc.slice(anchor + 1);
    head = doc.indexOf("»");
    doc = doc.slice(0, head) + doc.slice(head + 1);
  }
  return EditorState.create({
    doc,
    selection: EditorSelection.single(anchor, head),
    extensions:
      lineSeparator === undefined
        ? []
        : EditorState.lineSeparator.of(lineSeparator),
  });
}

/** The doc after the transaction, with the selection marked the same way. */
function show(state: EditorState): string {
  const doc = state.sliceDoc();
  const { from, to } = state.selection.main;
  if (from === to) return `${doc.slice(0, from)}‸${doc.slice(from)}`;
  return `${doc.slice(0, from)}«${doc.slice(from, to)}»${doc.slice(to)}`;
}

function apply(
  text: string,
  command: (state: EditorState) => TransactionSpec,
  lineSeparator: string | undefined,
): string {
  const state = stateOf(text, lineSeparator);
  return show(state.update(command(state)).state);
}

describe("toggleInlineFormat", () => {
  it.each([
    ["bold", "**"],
    ["strikethrough", "~~"],
    ["inlineCode", "`"],
  ] as const)("wraps and unwraps %s", (format, marker) => {
    const wrapped = apply(
      "say «hello» now",
      (state) => toggleInlineFormat(state, format),
      undefined,
    );
    expect(wrapped).toBe(`say ${marker}«hello»${marker} now`);
    expect(
      apply(wrapped, (state) => toggleInlineFormat(state, format), undefined),
    ).toBe("say «hello» now");
  });

  it("writes underline as an HTML tag", () => {
    expect(
      apply(
        "say «hello»",
        (state) => toggleInlineFormat(state, "underline"),
        undefined,
      ),
    ).toBe("say <u>«hello»</u>");
  });

  it("unwraps markers that are inside the selection", () => {
    expect(
      apply(
        "say «_hello_» now",
        (state) => toggleInlineFormat(state, "italic"),
        undefined,
      ),
    ).toBe("say «hello» now");
  });

  it("does not read bold markers as italic", () => {
    expect(
      apply(
        "say **«hello»**",
        (state) => toggleInlineFormat(state, "italic"),
        undefined,
      ),
    ).toBe("say **_«hello»_**");
  });

  it("puts the caret between new markers when nothing is selected", () => {
    expect(
      apply("say ‸", (state) => toggleInlineFormat(state, "bold"), undefined),
    ).toBe("say **‸**");
  });
});

describe("toggleLineFormat", () => {
  it("adds, swaps and removes a heading on the caret's line", () => {
    const h2 = apply(
      "Title‸ here",
      (state) => toggleLineFormat(state, "heading2"),
      undefined,
    );
    expect(h2).toBe("## Title‸ here");
    const h1 = apply(
      h2,
      (state) => toggleLineFormat(state, "heading1"),
      undefined,
    );
    expect(h1).toBe("# Title‸ here");
    expect(
      apply(h1, (state) => toggleLineFormat(state, "heading1"), undefined),
    ).toBe("Title‸ here");
  });

  it("numbers each selected line and skips blank ones", () => {
    expect(
      apply(
        "«one\n\ntwo\nthree»",
        (state) => toggleLineFormat(state, "numberedList"),
        undefined,
      ),
    ).toBe("1. «one\n\n2. two\n3. three»");
  });

  it("turns bullets into checklist items and back off", () => {
    const tasks = apply(
      "«- one\n- two»",
      (state) => toggleLineFormat(state, "taskList"),
      undefined,
    );
    expect(tasks).toBe("«- [ ] one\n- [ ] two»");
    expect(
      apply(tasks, (state) => toggleLineFormat(state, "taskList"), undefined),
    ).toBe("«one\ntwo»");
  });

  it("leaves out the line a selection ends at the start of", () => {
    expect(
      apply(
        "«a\nb\n»c",
        (state) => toggleLineFormat(state, "bulletList"),
        undefined,
      ),
    ).toBe("- «a\n- b\n»c");
  });

  it("keeps indentation", () => {
    expect(
      apply(
        "  item‸",
        (state) => toggleLineFormat(state, "bulletList"),
        undefined,
      ),
    ).toBe("  - item‸");
  });

  it("starts a list on an empty line", () => {
    expect(
      apply("‸", (state) => toggleLineFormat(state, "quote"), undefined),
    ).toBe("> ‸");
  });
});

describe("insertLink", () => {
  it("selects the URL after linking selected text", () => {
    expect(
      apply("see «docs»", (state) => insertLink(state, "link"), undefined),
    ).toBe("see [docs](«https://»)");
  });

  it("selects a placeholder label when nothing is selected", () => {
    expect(apply("‸", (state) => insertLink(state, "image"), undefined)).toBe(
      "![«alt text»](https://)",
    );
  });
});

describe("insertBlock", () => {
  it("opens an empty code block with the caret inside", () => {
    expect(
      apply(
        "‸",
        (state) => insertBlock(state, { kind: "codeBlock", language: "ts" }),
        undefined,
      ),
    ).toBe("```ts\n‸\n```");
  });

  it("fences the selection and separates the block from text on its line", () => {
    expect(
      apply(
        "Run «npm test» now",
        (state) => insertBlock(state, { kind: "codeBlock", language: "" }),
        undefined,
      ),
    ).toBe("Run \n\n```\nnpm test\n```‸\n\n now");
  });

  it("uses the file's own line separator", () => {
    const state = EditorState.create({
      doc: "a\r\n",
      selection: EditorSelection.cursor(2),
      extensions: EditorState.lineSeparator.of("\r\n"),
    });
    const next = state.update(insertBlock(state, { kind: "table" })).state;

    expect(next.sliceDoc()).toBe(
      "a\r\n\r\n| Column 1 | Column 2 | Column 3 |\r\n| --- | --- | --- |\r\n|  |  |  |\r\n|  |  |  |",
    );
    const caretLine = next.doc.lineAt(next.selection.main.head);
    expect(caretLine.number).toBe(5);
    expect(next.selection.main.head - caretLine.from).toBe(2);
  });

  it("fences a triple-clicked line without an empty line inside", () => {
    expect(
      apply(
        "x\n\n«line1\n»line2",
        (state) => insertBlock(state, { kind: "codeBlock", language: "ts" }),
        undefined,
      ),
    ).toBe("x\n\n```ts\nline1\n```‸\n\nline2");
  });

  it("keeps a divider from turning the paragraph above into a heading", () => {
    expect(
      apply(
        "Para\n‸",
        (state) => insertBlock(state, { kind: "horizontalRule" }),
        undefined,
      ),
    ).toBe("Para\n\n---‸");
  });

  it("keeps the text below a table out of its rows", () => {
    expect(
      apply(
        "‸\nAfter",
        (state) => insertBlock(state, { kind: "horizontalRule" }),
        undefined,
      ),
    ).toBe("---‸\n\nAfter");
  });

  it("inserts a divider", () => {
    expect(
      apply(
        "‸",
        (state) => insertBlock(state, { kind: "horizontalRule" }),
        undefined,
      ),
    ).toBe("---‸");
  });
});

describe("insertText", () => {
  it("replaces the selection", () => {
    expect(
      apply("ship «it»", (state) => insertText(state, "🚀"), undefined),
    ).toBe("ship 🚀‸");
  });
});
