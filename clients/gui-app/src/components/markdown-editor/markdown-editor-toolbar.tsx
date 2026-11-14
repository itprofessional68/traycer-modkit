import type { ReactNode } from "react";
import type { EditorView } from "@uiw/react-codemirror";
import type { TransactionSpec, EditorState } from "@codemirror/state";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  SquareCode,
  Strikethrough,
  Table,
  TextQuote,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  insertBlock,
  insertLink,
  insertText,
  toggleInlineFormat,
  toggleLineFormat,
} from "@/lib/markdown-editor/commands";
import { EmojiPicker } from "@/components/markdown-editor/emoji-picker";
import { modLabel } from "@/lib/keybindings/platform";

type ToolbarCommand = (state: EditorState) => TransactionSpec;

interface ToolbarAction {
  readonly label: string;
  /** Letter pressed with the platform modifier, shown in the tooltip. */
  readonly shortcutKey: string | null;
  readonly icon: ReactNode;
  readonly command: ToolbarCommand;
}

const HEADING_ACTIONS: readonly ToolbarAction[] = [
  {
    label: "Heading 1",
    shortcutKey: null,
    icon: <Heading1 className="size-4" />,
    command: (state) => toggleLineFormat(state, "heading1"),
  },
  {
    label: "Heading 2",
    shortcutKey: null,
    icon: <Heading2 className="size-4" />,
    command: (state) => toggleLineFormat(state, "heading2"),
  },
  {
    label: "Heading 3",
    shortcutKey: null,
    icon: <Heading3 className="size-4" />,
    command: (state) => toggleLineFormat(state, "heading3"),
  },
];

const INLINE_ACTIONS: readonly ToolbarAction[] = [
  {
    label: "Bold",
    shortcutKey: "B",
    icon: <Bold className="size-4" />,
    command: (state) => toggleInlineFormat(state, "bold"),
  },
  {
    label: "Italic",
    shortcutKey: "I",
    icon: <Italic className="size-4" />,
    command: (state) => toggleInlineFormat(state, "italic"),
  },
  {
    label: "Underline",
    shortcutKey: "U",
    icon: <Underline className="size-4" />,
    command: (state) => toggleInlineFormat(state, "underline"),
  },
  {
    label: "Strikethrough",
    shortcutKey: null,
    icon: <Strikethrough className="size-4" />,
    command: (state) => toggleInlineFormat(state, "strikethrough"),
  },
  {
    label: "Inline code",
    shortcutKey: null,
    icon: <Code className="size-4" />,
    command: (state) => toggleInlineFormat(state, "inlineCode"),
  },
];

const BLOCK_ACTIONS: readonly ToolbarAction[] = [
  {
    label: "Bulleted list",
    shortcutKey: null,
    icon: <List className="size-4" />,
    command: (state) => toggleLineFormat(state, "bulletList"),
  },
  {
    label: "Numbered list",
    shortcutKey: null,
    icon: <ListOrdered className="size-4" />,
    command: (state) => toggleLineFormat(state, "numberedList"),
  },
  {
    label: "Checklist",
    shortcutKey: null,
    icon: <ListTodo className="size-4" />,
    command: (state) => toggleLineFormat(state, "taskList"),
  },
  {
    label: "Quote",
    shortcutKey: null,
    icon: <TextQuote className="size-4" />,
    command: (state) => toggleLineFormat(state, "quote"),
  },
];

const INSERT_ACTIONS: readonly ToolbarAction[] = [
  {
    label: "Link",
    shortcutKey: null,
    icon: <Link className="size-4" />,
    command: (state) => insertLink(state, "link"),
  },
  {
    label: "Image",
    shortcutKey: null,
    icon: <Image className="size-4" />,
    command: (state) => insertLink(state, "image"),
  },
  {
    label: "Table",
    shortcutKey: null,
    icon: <Table className="size-4" />,
    command: (state) => insertBlock(state, { kind: "table" }),
  },
  {
    label: "Divider",
    shortcutKey: null,
    icon: <Minus className="size-4" />,
    command: (state) => insertBlock(state, { kind: "horizontalRule" }),
  },
];

const CODE_BLOCK_LANGUAGES: ReadonlyArray<{
  readonly label: string;
  readonly language: string;
}> = [
  { label: "Plain text", language: "" },
  { label: "TypeScript", language: "ts" },
  { label: "JavaScript", language: "js" },
  { label: "Python", language: "python" },
  { label: "Shell", language: "bash" },
  { label: "JSON", language: "json" },
  { label: "YAML", language: "yaml" },
  { label: "HTML", language: "html" },
  { label: "CSS", language: "css" },
  { label: "SQL", language: "sql" },
  { label: "Markdown", language: "md" },
  { label: "Mermaid diagram", language: "mermaid" },
];

/**
 * Formatting buttons for a markdown source editor. Every button edits the
 * markdown text at the selection; the buttons keep the editor focused so the
 * selection survives the click.
 */
export function MarkdownEditorToolbar(props: {
  readonly view: EditorView | null;
  readonly disabled: boolean;
}) {
  const { view } = props;
  const disabled = props.disabled || view === null;
  const run = (command: ToolbarCommand): void => {
    if (view === null) return;
    view.dispatch(command(view.state));
    view.focus();
  };

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="flex shrink-0 flex-wrap items-center gap-0.5 border-b border-canvas-border/70 px-2 py-1"
      data-testid="markdown-editor-toolbar"
    >
      <ActionGroup actions={HEADING_ACTIONS} disabled={disabled} onRun={run} />
      <ToolbarSeparator />
      <ActionGroup actions={INLINE_ACTIONS} disabled={disabled} onRun={run} />
      <ToolbarSeparator />
      <ActionGroup actions={BLOCK_ACTIONS} disabled={disabled} onRun={run} />
      <DropdownMenu>
        <TooltipWrapper
          label="Code block"
          side="top"
          sideOffset={undefined}
          align={undefined}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="muted"
              size="icon-sm"
              aria-label="Code block"
              disabled={disabled}
              onMouseDown={(event) => event.preventDefault()}
            >
              <SquareCode className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipWrapper>
        <DropdownMenuContent align="start" className="w-[min(90vw,12rem)]">
          {CODE_BLOCK_LANGUAGES.map((option) => (
            <DropdownMenuItem
              key={option.label}
              onSelect={() =>
                run((state) =>
                  insertBlock(state, {
                    kind: "codeBlock",
                    language: option.language,
                  }),
                )
              }
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarSeparator />
      <ActionGroup actions={INSERT_ACTIONS} disabled={disabled} onRun={run} />
      <EmojiPicker
        disabled={disabled}
        onPick={(emoji) => run((state) => insertText(state, emoji))}
      />
    </div>
  );
}

function ActionGroup(props: {
  readonly actions: readonly ToolbarAction[];
  readonly disabled: boolean;
  readonly onRun: (command: ToolbarCommand) => void;
}) {
  return props.actions.map((action) => (
    <TooltipWrapper
      key={action.label}
      label={
        action.shortcutKey === null
          ? action.label
          : `${action.label} (${modLabel()}+${action.shortcutKey})`
      }
      side="top"
      sideOffset={undefined}
      align={undefined}
    >
      <Button
        type="button"
        variant="muted"
        size="icon-sm"
        aria-label={action.label}
        disabled={props.disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => props.onRun(action.command)}
      >
        {action.icon}
      </Button>
    </TooltipWrapper>
  ));
}

function ToolbarSeparator() {
  return <Separator orientation="vertical" className="mx-1 h-4" />;
}
