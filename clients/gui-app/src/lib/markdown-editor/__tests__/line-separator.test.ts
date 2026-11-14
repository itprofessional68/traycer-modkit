import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import {
  detectLineSeparator,
  normalizeLineBreaks,
} from "@/lib/markdown-editor/line-separator";

function roundTrip(text: string): string {
  const state = EditorState.create({
    doc: text,
    extensions: EditorState.lineSeparator.of(detectLineSeparator(text)),
  });
  return state.sliceDoc();
}

describe("detectLineSeparator", () => {
  it.each([
    ["LF", "# Title\n\nBody\n", "\n"],
    ["CRLF", "# Title\r\n\r\nBody\r\n", "\r\n"],
    ["lone CR", "# Title\r\rBody\r", "\r"],
    ["no line break", "# Title", "\n"],
    ["mostly CRLF", "a\r\nb\r\nc\nd\r\n", "\r\n"],
  ] as const)("picks %s", (_label, text, expected) => {
    expect(detectLineSeparator(text)).toBe(expected);
  });

  it.each([
    ["LF", "# Title\n\n- item\n"],
    ["CRLF", "# Title\r\n\r\n- item\r\n"],
    ["lone CR", "# Title\r\r- item\r"],
    ["mixed endings", "a\r\nb\nc\r\n"],
  ])("lets the editor hand a %s file back byte for byte", (_label, text) => {
    expect(roundTrip(text)).toBe(text);
  });
});

describe("normalizeLineBreaks", () => {
  it("rewrites every kind of line break as the file's own", () => {
    expect(normalizeLineBreaks("a\nb\r\nc\rd", "\r\n")).toBe(
      "a\r\nb\r\nc\r\nd",
    );
    expect(normalizeLineBreaks("a\r\nb", "\n")).toBe("a\nb");
  });
});
