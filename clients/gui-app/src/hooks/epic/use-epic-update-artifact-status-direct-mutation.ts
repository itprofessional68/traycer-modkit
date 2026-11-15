import {
  useMutation,
  useQueryClient,
  type QueryKey,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import {
  hostRpcServingTierHostId,
  readProcessHostRpcTierPlan,
} from "@traycer-clients/shared/host-client/host-rpc-routing";
import type { HostRpcError } from "@traycer-clients/shared/host-transport/host-messenger";
import type { TicketStatus } from "@traycer/protocol/common/registry";
import type { EpicMentionTicketsResponse } from "@traycer/protocol/host/epic/unary-schemas";
import {
  trackArtifactStatusChanged,
  updateArtifactStatusThroughOpenEpic,
} from "@/hooks/epic/use-epic-node-mutations";
import {
  hostClientUnavailableError,
  withHostMutationLifecycleBoundary,
} from "@/hooks/host/use-host-query";
import type { HostRpcRegistry } from "@/lib/host";
import { toastFromHostError } from "@/lib/host-error-toast";
import { epicMutationKeys, hostQueryKeys } from "@/lib/query-keys";
import { withHostQueryErrorBoundary } from "@/lib/query/host-query-error-boundary";
import {
  getOpenEpicRegistry,
  isEpicSessionHandleDead,
} from "@/lib/registries/epic-session-registry";

export interface UpdateTicketStatusVariables {
  readonly epicId: string;
  readonly artifactId: string;
  readonly status: TicketStatus;
}

interface TicketStatusContext {
  /** Every cached ticket read of the host the To-dos pane reads. */
  readonly ticketsScope: QueryKey;
  /** Those reads as they were, to put back if the write fails. */
  readonly previous: ReadonlyArray<
    readonly [QueryKey, EpicMentionTicketsResponse | undefined]
  >;
}

/**
 * Sets a ticket's status from the To-dos pane, which lists tickets from
 * Tasks that may or may not be open here. An open Task takes the write
 * through its own queue, so its projection and pending state stay right;
 * any other goes straight to `epic.updateArtifactStatus` on the pane's host.
 *
 * The ticket's row moves at once (an optimistic edit of the cached ticket
 * reads), and the edit is undone with a toast if the write fails. Every
 * callback is the mutation's own, never one handed to a single call: a row
 * checked off under the Open filter leaves the list at once, so the
 * component that started the write is gone before the host answers.
 */
export function useEpicUpdateArtifactStatusDirect(
  client: Pick<
    HostClient<HostRpcRegistry>,
    "request" | "getActiveHostId"
  > | null,
): UseMutationResult<
  void,
  HostRpcError,
  UpdateTicketStatusVariables,
  TicketStatusContext
> {
  const queryClient = useQueryClient();
  return useMutation(
    withHostMutationLifecycleBoundary("epic.updateArtifactStatus", {
      mutationKey: epicMutationKeys.updateArtifactStatus(),
      onMutate: async (variables): Promise<TicketStatusContext> => {
        // Captured here, not re-read on settle: the app-wide host can change
        // while the write is in flight, and its answer belongs to this one.
        const ticketsScope = hostQueryKeys.methodScope(
          hostRpcServingTierHostId(
            "epic.mentionTickets",
            client?.getActiveHostId() ?? null,
            readProcessHostRpcTierPlan(),
            null,
          ),
          "epic.mentionTickets",
        );
        await queryClient.cancelQueries({ queryKey: ticketsScope });
        const previous = queryClient.getQueriesData<EpicMentionTicketsResponse>(
          { queryKey: ticketsScope },
        );
        queryClient.setQueriesData<EpicMentionTicketsResponse>(
          { queryKey: ticketsScope },
          (data) =>
            data === undefined ? data : withTicketStatus(data, variables),
        );
        return { ticketsScope, previous };
      },
      mutationFn: (variables) =>
        withHostQueryErrorBoundary("epic.updateArtifactStatus", async () => {
          // `peek`, not `get`: a write from outside the Task is not a visit,
          // and must not keep it from being the next one released.
          const handle = getOpenEpicRegistry().peek(variables.epicId);
          if (handle !== null && !isEpicSessionHandleDead(handle)) {
            await updateArtifactStatusThroughOpenEpic(handle, {
              artifactId: variables.artifactId,
              artifactType: "ticket",
              status: variables.status,
            });
            return;
          }
          if (client === null) {
            throw hostClientUnavailableError("epic.updateArtifactStatus");
          }
          await client.request("epic.updateArtifactStatus", {
            epicId: variables.epicId,
            artifactId: variables.artifactId,
            artifactType: "ticket",
            status: variables.status,
          });
          trackArtifactStatusChanged("ticket", variables.status);
        }),
      onError: (error, _variables, context) => {
        if (context !== undefined) {
          for (const [queryKey, data] of context.previous) {
            queryClient.setQueryData(queryKey, data);
          }
        }
        toastFromHostError(error, "Couldn't update the ticket.");
      },
      onSettled: (_data, _error, _variables, context) => {
        if (context === undefined) return;
        void queryClient.invalidateQueries({ queryKey: context.ticketsScope });
      },
    }),
  );
}

function withTicketStatus(
  data: EpicMentionTicketsResponse,
  variables: UpdateTicketStatusVariables,
): EpicMentionTicketsResponse {
  return {
    ...data,
    entries: data.entries.map((entry) =>
      entry.epicId === variables.epicId &&
      entry.artifactId === variables.artifactId
        ? { ...entry, status: variables.status }
        : entry,
    ),
  };
}
