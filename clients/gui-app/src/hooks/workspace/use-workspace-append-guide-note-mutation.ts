import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import type { HostRpcError } from "@traycer-clients/shared/host-transport/host-messenger";
import {
  hostClientUnavailableError,
  withHostMutationLifecycleBoundary,
} from "@/hooks/host/use-host-query";
import {
  guideWithNote,
  WORKSPACE_GUIDE_PATH,
} from "@/lib/agent-presets/guide-note";
import type { HostRpcRegistry } from "@/lib/host";
import { workspaceMutationKeys } from "@/lib/query-keys";
import { withHostQueryErrorBoundary } from "@/lib/query/host-query-error-boundary";
import { fileContentRevision } from "@/lib/workspace/file-content-revision";

/** The guide file's largest readable size, the host's own read limit. */
const GUIDE_MAX_BYTES = 1_000_000;

export interface AppendGuideNoteVariables {
  readonly repoPath: string;
  readonly note: string;
}

/**
 * - `added`: the note is now the guide's last paragraph.
 * - `present`: the guide already held it; nothing was written.
 * - `no-guide`: the project has no guide this host could read. Nothing is
 *   created: a guide is the project's own file, and the person decides
 *   whether it has one.
 * - `changed`: the guide changed between the read and the write; nothing was
 *   written.
 */
export type AppendGuideNoteOutcome =
  | "added"
  | "present"
  | "no-guide"
  | "changed";

/**
 * Adds a preset's guide note to the project's agent selection guide
 * (`.traycer/agent-selection-guide.md`) on the preset's host: a read, then a
 * write guarded by the read's revision, so an edit made in between is never
 * overwritten. Two calls, so it is built on `useMutation` with the host
 * boundaries `useHostMutation` would apply to one.
 */
export function useWorkspaceAppendGuideNote(
  client: HostClient<HostRpcRegistry> | null,
): UseMutationResult<
  AppendGuideNoteOutcome,
  HostRpcError,
  AppendGuideNoteVariables
> {
  return useMutation(
    withHostMutationLifecycleBoundary("workspace.writeFile", {
      mutationKey: workspaceMutationKeys.appendGuideNote(),
      mutationFn: (variables: AppendGuideNoteVariables) =>
        withHostQueryErrorBoundary("workspace.writeFile", async () => {
          if (client === null) {
            return Promise.reject<AppendGuideNoteOutcome>(
              hostClientUnavailableError("workspace.writeFile"),
            );
          }
          return appendGuideNote(client, variables);
        }),
    }),
  );
}

/** The read-then-write itself, over any requester for the preset's host. */
export async function appendGuideNote(
  client: Pick<HostClient<HostRpcRegistry>, "request">,
  variables: AppendGuideNoteVariables,
): Promise<AppendGuideNoteOutcome> {
  const read = await client.request("workspace.readFile", {
    workspacePath: variables.repoPath,
    filePath: WORKSPACE_GUIDE_PATH,
    maxBytes: GUIDE_MAX_BYTES,
  });
  if (read.content === null) return "no-guide";
  if (read.truncated) {
    throw new Error("The agent selection guide is too large to add to.");
  }
  const next = guideWithNote(read.content, variables.note);
  if (next === null) return "present";
  const written = await client.request("workspace.writeFile", {
    workspacePath: variables.repoPath,
    filePath: WORKSPACE_GUIDE_PATH,
    expectedRevision: await fileContentRevision(read.content),
    content: next,
  });
  if (written.status === "conflict") return "changed";
  if (written.status === "error") throw new Error(written.error);
  return "added";
}
