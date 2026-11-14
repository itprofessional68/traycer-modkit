import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@uiw/react-codemirror";

/** Markdown language, wrapping and the app-token theme every markdown source editor shares. */
export const MARKDOWN_EDITOR_EXTENSIONS = [
  markdown(),
  EditorView.lineWrapping,
  EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--foreground)",
    },
    ".cm-scroller": {
      height: "100%",
      backgroundColor: "transparent",
      fontFamily: "var(--font-mono)",
      fontSize: "var(--code-font-size, 0.8rem)",
    },
    ".cm-content": {
      minHeight: "100%",
      caretColor: "var(--foreground)",
    },
    ".cm-gutters": {
      backgroundColor: "color-mix(in oklab, var(--foreground) 5%, transparent)",
      border: "none",
      color: "var(--muted-foreground)",
    },
    ".cm-activeLine, .cm-activeLineGutter": {
      backgroundColor: "color-mix(in oklab, var(--accent) 55%, transparent)",
    },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "color-mix(in oklab, var(--primary) 25%, transparent)",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--foreground)",
    },
  }),
];

export const MARKDOWN_EDITOR_BASIC_SETUP = {
  lineNumbers: true,
  foldGutter: false,
  highlightActiveLine: true,
  highlightActiveLineGutter: true,
  autocompletion: false,
};
