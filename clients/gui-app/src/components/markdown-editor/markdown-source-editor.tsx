import { useEffect, useLayoutEffect, useRef } from "react";
import {
  Annotation,
  Compartment,
  EditorState,
  Prec,
  Transaction,
} from "@codemirror/state";
import {
  EditorView,
  getDefaultExtensions,
  keymap,
} from "@uiw/react-codemirror";
import {
  MARKDOWN_EDITOR_BASIC_SETUP,
  MARKDOWN_EDITOR_EXTENSIONS,
} from "@/editor-core/markdown-codemirror-extensions";
import { useCodeMirrorTheme } from "@/editor-core/use-code-mirror-theme";
import {
  toggleInlineFormat,
  type MarkdownInlineFormat,
} from "@/lib/markdown-editor/commands";
import {
  detectLineSeparator,
  normalizeLineBreaks,
} from "@/lib/markdown-editor/line-separator";

/** Marks a transaction that loads outside content, so it is not echoed back as an edit. */
const externalContent = Annotation.define<boolean>();

export interface MarkdownSourceEditorProps {
  /** Exact file text. Line endings are preserved on every change reported back. */
  readonly value: string;
  readonly readOnly: boolean;
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly onSave: () => void;
  readonly onViewChange: (view: EditorView | null) => void;
}

/**
 * A CodeMirror editor that reports the document with the file's own line
 * separator. `@uiw/react-codemirror`'s controlled mode compares against
 * `doc.toString()`, which always joins with `\n`, so a CRLF file would be
 * rewritten on its first save; this host reads `sliceDoc()` instead.
 */
export function MarkdownSourceEditor(props: MarkdownSourceEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const editableCompartment = useRef(new Compartment());
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  }, [props]);
  const theme = useCodeMirrorTheme();
  const themeRef = useRef(theme);

  useEffect(() => {
    const parent = hostRef.current;
    if (parent === null) return;
    const initial = propsRef.current;
    const formatKey = (format: MarkdownInlineFormat) => (view: EditorView) => {
      view.dispatch(toggleInlineFormat(view.state, format));
      return true;
    };
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: initial.value,
        extensions: [
          EditorState.lineSeparator.of(detectLineSeparator(initial.value)),
          EditorView.clipboardInputFilter.of((text, state) =>
            normalizeLineBreaks(text, state.lineBreak),
          ),
          themeCompartment.current.of(
            getDefaultExtensions({
              theme: themeRef.current,
              basicSetup: MARKDOWN_EDITOR_BASIC_SETUP,
              indentWithTab: true,
            }),
          ),
          editableCompartment.current.of(editability(initial.readOnly)),
          MARKDOWN_EDITOR_EXTENSIONS,
          EditorView.contentAttributes.of({
            "aria-label": initial.ariaLabel,
            "aria-multiline": "true",
            role: "textbox",
            spellcheck: "false",
          }),
          Prec.high(
            keymap.of([
              { key: "Mod-b", run: formatKey("bold") },
              { key: "Mod-i", run: formatKey("italic") },
              { key: "Mod-u", run: formatKey("underline") },
              {
                key: "Mod-s",
                preventDefault: true,
                run: () => {
                  propsRef.current.onSave();
                  return true;
                },
              },
            ]),
          ),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const external = update.transactions.some(
              (transaction) => transaction.annotation(externalContent) === true,
            );
            if (!external) propsRef.current.onChange(update.state.sliceDoc());
          }),
          EditorView.domEventHandlers({
            blur: () => {
              propsRef.current.onBlur();
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    initial.onViewChange(view);
    return () => {
      propsRef.current.onViewChange(null);
      viewRef.current = null;
      view.destroy();
    };
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (view === null || props.value === view.state.sliceDoc()) return;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: props.value },
      annotations: [
        externalContent.of(true),
        Transaction.addToHistory.of(false),
      ],
    });
  }, [props.value]);

  useEffect(() => {
    themeRef.current = theme;
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure(
        getDefaultExtensions({
          theme,
          basicSetup: MARKDOWN_EDITOR_BASIC_SETUP,
          indentWithTab: true,
        }),
      ),
    });
  }, [theme]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editableCompartment.current.reconfigure(
        editability(props.readOnly),
      ),
    });
  }, [props.readOnly]);

  return (
    <div
      ref={hostRef}
      className="h-full min-h-0 overflow-hidden"
      data-testid="markdown-source-editor"
    />
  );
}

function editability(readOnly: boolean) {
  return [EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)];
}
