import type { ReactNode } from "react";
import { toast } from "sonner";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { Button } from "@/components/ui/button";
import { useClipboardCopy } from "@/hooks/ui/use-clipboard-copy";
import {
  useWorkspaceAppendGuideNote,
  type AppendGuideNoteOutcome,
} from "@/hooks/workspace/use-workspace-append-guide-note-mutation";
import type { HostRpcRegistry } from "@/lib/host";

const COPY_FAILED = "Couldn't copy the note.";

/**
 * "Add to guide" on a preset row: adds the preset's note to its project's
 * agent selection guide on the preset's host. A guide the host cannot open
 * (the project may have none) is never made; the note is copied instead, for
 * the person to put where they choose.
 */
export function PresetGuideNoteButton(props: {
  readonly client: Pick<HostClient<HostRpcRegistry>, "request"> | null;
  readonly repoPath: string;
  readonly note: string;
}): ReactNode {
  const { client, repoPath, note } = props;
  const append = useWorkspaceAppendGuideNote(client);
  const { copy } = useClipboardCopy({
    resetMs: 0,
    onSuccess: () => {
      toast.info(
        "Couldn't open this project's agent selection guide, so the note was copied.",
      );
    },
    onError: () => {
      toast.error(COPY_FAILED);
    },
  });
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={client === null || append.isPending}
      data-testid="agent-preset-add-to-guide"
      onClick={() => {
        // `mutateAsync`, not callbacks handed to `mutate`: the row can go
        // (the preset deleted, another machine chosen) before the host
        // answers, and TanStack drops a per-call callback whose component is
        // gone. The continuation reads no component state; a failure is
        // toasted by the hook.
        void append.mutateAsync({ repoPath, note }).then(
          (outcome) => {
            reportOutcome(outcome, () => copy(note));
          },
          () => undefined,
        );
      }}
    >
      Add to guide
      {append.isPending ? (
        <AgentSpinningDots
          className="ml-1"
          testId={undefined}
          variant={undefined}
        />
      ) : null}
    </Button>
  );
}

function reportOutcome(
  outcome: AppendGuideNoteOutcome,
  copyNote: () => void,
): void {
  if (outcome === "added") {
    toast.success("Added to the project's agent selection guide.");
  } else if (outcome === "present") {
    toast.info("The guide already has this note.");
  } else if (outcome === "changed") {
    toast.warning("The guide changed while saving. Try again.");
  } else {
    copyNote();
  }
}
