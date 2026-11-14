import { useMemo, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MARKDOWN_EDITOR_BASIC_SETUP,
  MARKDOWN_EDITOR_EXTENSIONS,
} from "@/editor-core/markdown-codemirror-extensions";
import { useCodeMirrorTheme } from "@/editor-core/use-code-mirror-theme";
import { TraycerMarkdown } from "@/markdown";

type MarkdownEditPreviewView = "edit" | "preview";

export type MarkdownEditPreviewProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly: boolean;
  readonly placeholder: string | undefined;
  readonly ariaLabel: string;
  readonly testId: string;
  readonly showPreview: boolean;
};

export function MarkdownPreview({ value }: { readonly value: string }) {
  return (
    <TraycerMarkdown
      className="px-3 py-2 text-foreground"
      proseSize="compact"
      components={null}
      remarkPlugins={null}
      rehypePlugins={null}
      quotable={false}
      isStreaming={false}
    >
      {value}
    </TraycerMarkdown>
  );
}

export function MarkdownEditPreview({
  value,
  onChange,
  readOnly,
  placeholder,
  ariaLabel,
  testId,
  showPreview,
}: MarkdownEditPreviewProps) {
  const theme = useCodeMirrorTheme();
  const [view, setView] = useState<MarkdownEditPreviewView>("edit");
  const extensions = useMemo(
    () => [
      ...MARKDOWN_EDITOR_EXTENSIONS,
      EditorView.contentAttributes.of({
        "aria-label": ariaLabel,
        "aria-multiline": "true",
        role: "textbox",
        spellcheck: "false",
      }),
    ],
    [ariaLabel],
  );

  const editor = (
    <CodeMirror
      value={value}
      onChange={onChange}
      editable={!readOnly}
      readOnly={readOnly}
      height="100%"
      theme={theme}
      placeholder={placeholder}
      basicSetup={MARKDOWN_EDITOR_BASIC_SETUP}
      extensions={extensions}
      data-testid={testId}
      className="h-full"
    />
  );

  if (!showPreview) return editor;

  return (
    <Tabs
      value={view}
      onValueChange={(next) => {
        if (next === "edit" || next === "preview") setView(next);
      }}
      className="h-full min-h-0"
    >
      <TabsList aria-label="Editor view" className="self-end">
        <TabsTrigger value="edit">Edit</TabsTrigger>
        <TabsTrigger value="preview">Preview</TabsTrigger>
      </TabsList>
      <TabsContent
        value="edit"
        forceMount
        className="min-h-0 overflow-hidden data-[state=inactive]:hidden"
      >
        {editor}
      </TabsContent>
      <TabsContent
        value="preview"
        className="min-h-0 overflow-auto"
        data-testid={`${testId}-preview`}
      >
        <MarkdownPreview value={value} />
      </TabsContent>
    </Tabs>
  );
}
