import { useDeferredValue, useMemo, useState, type ReactNode } from "react";
import type { EditorView } from "@uiw/react-codemirror";
import { MarkdownEditorToolbar } from "@/components/markdown-editor/markdown-editor-toolbar";
import { MarkdownSourceEditor } from "@/components/markdown-editor/markdown-source-editor";
import { TraycerMarkdown } from "@/markdown";

/**
 * Markdown source beside its rendered preview, with the formatting toolbar
 * above both. The two panes stack when the container is narrow. Only the
 * preview normalizes line endings; the source keeps the file's own.
 */
export function MarkdownSplitEditor(props: {
  readonly value: string;
  readonly readOnly: boolean;
  readonly fileName: string;
  readonly notice: ReactNode;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly onSave: () => void;
  readonly onPreviewRootChange: (root: HTMLElement | null) => void;
}) {
  const {
    value,
    readOnly,
    fileName,
    notice,
    onChange,
    onBlur,
    onSave,
    onPreviewRootChange,
  } = props;
  const [view, setView] = useState<EditorView | null>(null);
  const deferredValue = useDeferredValue(value);
  const previewMarkdown = useMemo(
    () => deferredValue.replace(/\r\n?/g, "\n"),
    [deferredValue],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MarkdownEditorToolbar view={view} disabled={readOnly} />
      {notice}
      <div className="@container min-h-0 flex-1">
        <div className="grid h-full min-h-0 grid-rows-2 @3xl:grid-cols-2 @3xl:grid-rows-1">
          <div className="min-h-0 min-w-0 border-b border-canvas-border/70 @3xl:border-r @3xl:border-b-0">
            <MarkdownSourceEditor
              value={value}
              readOnly={readOnly}
              ariaLabel={`${fileName} markdown source`}
              onChange={onChange}
              onBlur={onBlur}
              onSave={onSave}
              onViewChange={setView}
            />
          </div>
          <section
            ref={onPreviewRootChange}
            className="min-h-0 min-w-0 overflow-auto bg-canvas px-5 py-4"
            aria-label={`${fileName} preview`}
            data-testid="markdown-split-preview"
          >
            <TraycerMarkdown
              className="mx-auto w-full max-w-3xl text-foreground"
              proseSize="normal"
              components={null}
              remarkPlugins={null}
              rehypePlugins={null}
              quotable={false}
              isStreaming={false}
            >
              {previewMarkdown}
            </TraycerMarkdown>
          </section>
        </div>
      </div>
    </div>
  );
}
