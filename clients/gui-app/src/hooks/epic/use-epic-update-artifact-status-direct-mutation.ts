import { useMemo } from "react";
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
import { useHostClient, type HostRpcRegistry } from "@/lib/host";
import {
  selectMutationVariables,
  useMutationStateOf,
} from "@/hooks/use-mutation-state-of";
import { toastFromHostError } from "@/lib/host-error-toast";
import { epicMutationKeys, hostQueryKeys } from "@/lib/query-keys";
import { withHostQueryErrorBoundary } from "@/lib/query/host-query-error-boundary";
import {
  getOpenEpicRegistry,
  isEpicSessionHandleDead,
} from "@/lib/registries/epic-session-registry";
import { ticketKey } from "@/lib/todos/group-todos";

export interface UpdateTicketStatusVariables {
  readonly epicId: string;
  readonly artifactId: string;
  readonly status: TicketStatus;
}

interface TicketStatusContext {
  /**
   * The ticket reads of the host the write was sent from, captured when it
   * started: the app-wide host can change while it is in flight.
   */
  readonly ticketsScope: QueryKey;
}

/**
 * Sets a ticket's status from the To-dos pane, which lists tickets from
 * Tasks that may or may not be open here. An open Task takes the write
 * through its own queue, so its projection and pending state stay right;
 * any other goes straight to `epic.updateArtifactStatus` on the pane's host.
 *
 * The cached reads are not edited while the write is in flight: the pane
 * lays the pending status over them ({@link usePendingTicketStatuses}), so
 * a read landing meanwhile cannot undo it, and a failed write needs no
 * rollback. Success writes the status into the reads before the overlay
 * lifts, so the row does not flicker back; then every host's ticket reads
 * are read again. Every callback is the mutation's own, never one handed to
 * a single call: a row checked off under the Open filter leaves the list at
 * once, so the component that started the write is gone before the host
 * answers.
 *
 * Reads the app-wide host, as the pane's tickets do. Mount only from the
 * To-dos tab.
 */
export function useEpicUpdateArtifactStatusDirect(): UseMutationResult<
  void,
  HostRpcError,
  UpdateTicketStatusVariables,
  TicketStatusContext
> {
  return useEpicUpdateArtifactStatusDirectForClient(useHostClient());
}

/**
 * {@link useEpicUpdateArtifactStatusDirect} on `client`'s host, which must be
 * the host the pane's tickets were read from: their cached reads are the ones
 * it edits.
 */
export function useEpicUpdateArtifactStatusDirectForClient(
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
      onMutate: (): TicketStatusContext => ({
        ticketsScope: hostQueryKeys.methodScope(
          hostRpcServingTierHostId(
            "epic.mentionTickets",
            client?.getActiveHostId() ?? null,
            readProcessHostRpcTierPlan(),
            null,
          ),
          "epic.mentionTickets",
        ),
      }),
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
      onSuccess: (_data, variables, context) => {
        queryClient.setQueriesData<EpicMentionTicketsResponse>(
          { queryKey: context.ticketsScope },
          (data) =>
            data === undefined ? data : withTicketStatus(data, variables),
        );
      },
      onError: (error) => {
        toastFromHostError(error, "Couldn't update the ticket.");
      },
      onSettled: () => {
        // Every host's: the app-wide host may have moved since the write
        // started, and the list now shown is the new host's.
        void queryClient.invalidateQueries({
          predicate: (query) =>
            hostQueryKeys.matchesMethodOnAnyHost(
              query.queryKey,
              "epic.mentionTickets",
            ),
        });
      },
    }),
  );
}

/**
 * The status each ticket is being set to by a To-dos write still in flight,
 * by {@link ticketKey}. The pane lays it over every ticket read, and a row
 * remounted mid-write reads from it that it is busy. With two writes to one
 * ticket, the newer wins.
 */
export function usePendingTicketStatuses(): ReadonlyMap<string, TicketStatus> {
  const pending = useMutationStateOf(
    { mutationKey: epicMutationKeys.updateArtifactStatus(), status: "pending" },
    selectMutationVariables,
  );
  return useMemo(
    () =>
      new Map(
        pending.flatMap((variables) =>
          isUpdateTicketStatusVariables(variables)
            ? [
                [
                  ticketKey(variables.epicId, variables.artifactId),
                  variables.status,
                ] as const,
              ]
            : [],
        ),
      ),
    [pending],
  );
}

function isUpdateTicketStatusVariables(
  value: unknown,
): value is UpdateTicketStatusVariables {
  return (
    typeof value === "object" &&
    value !== null &&
    "epicId" in value &&
    typeof value.epicId === "string" &&
    "artifactId" in value &&
    typeof value.artifactId === "string" &&
    "status" in value &&
    (value.status === 0 || value.status === 1 || value.status === 2)
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
