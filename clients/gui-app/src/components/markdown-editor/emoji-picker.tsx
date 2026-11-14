import { useId, useState } from "react";
import { Smile } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import {
  EMOJI_GROUPS,
  searchEmoji,
  type EmojiEntry,
} from "@/lib/markdown-editor/emoji-catalog";

export function EmojiPicker(props: {
  readonly disabled: boolean;
  readonly onPick: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchId = useId();
  const matches = searchEmoji(query);
  const searching = query.trim() !== "";

  const pick = (entry: EmojiEntry): void => {
    setOpen(false);
    setQuery("");
    props.onPick(entry.emoji);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <TooltipWrapper
        label="Emoji"
        side="top"
        sideOffset={undefined}
        align={undefined}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="muted"
            size="icon-sm"
            aria-label="Insert emoji"
            disabled={props.disabled}
            onMouseDown={(event) => event.preventDefault()}
          >
            <Smile className="size-4" />
          </Button>
        </PopoverTrigger>
      </TooltipWrapper>
      <PopoverContent
        layout="bare"
        align="end"
        className="w-[min(90vw,20rem)]"
        data-testid="markdown-emoji-picker"
      >
        <div className="flex flex-col gap-2 p-2">
          <label htmlFor={searchId} className="sr-only">
            Search emoji
          </label>
          <Input
            id={searchId}
            size="xs"
            placeholder="Search emoji"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {searching ? (
              <EmojiSearchResults matches={matches} onPick={pick} />
            ) : (
              EMOJI_GROUPS.map((group) => (
                <section
                  key={group.label}
                  aria-label={group.label}
                  className="flex flex-col gap-1"
                >
                  <h3 className="px-1 text-ui-xs font-medium text-muted-foreground">
                    {group.label}
                  </h3>
                  <EmojiGrid entries={group.entries} onPick={pick} />
                </section>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EmojiSearchResults(props: {
  readonly matches: readonly EmojiEntry[];
  readonly onPick: (entry: EmojiEntry) => void;
}) {
  if (props.matches.length === 0) {
    return (
      <p className="px-1 py-2 text-ui-xs text-muted-foreground">
        No emoji found
      </p>
    );
  }
  return <EmojiGrid entries={props.matches} onPick={props.onPick} />;
}

function EmojiGrid(props: {
  readonly entries: readonly EmojiEntry[];
  readonly onPick: (entry: EmojiEntry) => void;
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {props.entries.map((entry) => (
        <Button
          key={entry.emoji}
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={entry.name}
          onClick={() => props.onPick(entry)}
        >
          <span className="text-base leading-none">{entry.emoji}</span>
        </Button>
      ))}
    </div>
  );
}
