import type { ReactNode } from "react";
import { toast } from "sonner";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { Button } from "@/components/ui/button";
import { useClipboardCopy } from "@/hooks/ui/use-clipboard-copy";
import { useWorkspaceAppendGuideNote } from "@/hooks/workspace/use-workspace-append-guide-note-mutation";
import type { HostRpcRegistry } from "@/lib/host";
import { toastFromHostError } from "@/lib/host-error-toast";

const COPY_FAILED = "Couldn't copy the note.";

/**
 * "Add to guide" on a preset row: adds the preset's note to its project's
 * agent selection guide on the preset's host. A project without a guide gets
 * none made for it; the note is copied instead, for the person to put where
 * they choose.
 */
export function PresetGuideNoteButton(props: {
  readonly client: HostClient<HostRpcRegistry> | null;
  readonly repoPath: string;
  readonly note: string;
}): ReactNode {
  const { client, repoPath, note } = props;
  const append = useWorkspaceAppendGuideNote(client);
  const { copy } = useClipboardCopy({
    resetMs: 0,
    onSuccess: () => {
      toast.info(
        "This project has no agent selection guide, so the note was copied.",
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
        append.mutate(
          { repoPath, note },
          {
            onSuccess: (outcome) => {
              if (outcome === "added") {
                toast.success("Added to the project's agent selection guide.");
              } else if (outcome === "present") {
                toast.info("The guide already has this note.");
              } else if (outcome === "changed") {
                toast.warning("The guide changed while saving. Try again.");
              } else {
                copy(note);
              }
            },
            onError: (error) => {
              toastFromHostError(error, "Couldn't add the note to the guide.");
            },
          },
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
