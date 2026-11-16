import { useMemo } from "react";
import {
  useMutation,
  useQueryClient,
  type Query,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import type { HostRpcError } from "@traycer-clients/shared/host-transport/host-messenger";
import type { TicketStatus } from "@traycer/protocol/common/registry";
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
import { useTicketStatusHoldsStore } from "@/stores/todos/ticket-status-holds-store";

export interface UpdateTicketStatusVariables {
  readonly epicId: string;
  readonly artifactId: string;
  readonly status: TicketStatus;
}

/**
 * Sets a ticket's status from the To-dos pane, which lists tickets from
 * Tasks that may or may not be open here. An open Task takes the write
 * through its own queue, so its projection and pending state stay right;
 * any other goes straight to `epic.updateArtifactStatus` on the pane's host.
 *
 * The cached reads are never edited. While the write is in flight the pane
 * lays its status over them ({@link usePendingTicketStatuses}), so a read
 * landing meanwhile cannot undo it and a failed write needs no rollback.
 * Once the host confirms it, a 30 s hold (`useTicketStatusHoldsStore`) takes
 * over before the pending status lifts, because the host's ticket index
 * catches up a few seconds after the write and the next reads still say the
 * old status.
 * Every host's ticket reads are then read again: the app-wide host can change
 * while the write is in flight. Every callback is the mutation's own, never
 * one handed to a single call: a row checked off under the Open filter leaves
 * the list at once, so the component that started the write is gone before the host
 * answers.
 *
 * Reads the app-wide host, as the pane's tickets do. Mount only from the
 * To-dos tab.
 */
export function useEpicUpdateArtifactStatusDirect(): UseMutationResult<
  void,
  HostRpcError,
  UpdateTicketStatusVariables
> {
  return useEpicUpdateArtifactStatusDirectForClient(useHostClient());
}

/**
 * {@link useEpicUpdateArtifactStatusDirect} on `client`'s host: a Task not
 * open here takes the write there.
 */
export function useEpicUpdateArtifactStatusDirectForClient(
  client: Pick<HostClient<HostRpcRegistry>, "request"> | null,
): UseMutationResult<void, HostRpcError, UpdateTicketStatusVariables> {
  const queryClient = useQueryClient();
  return useMutation(
    withHostMutationLifecycleBoundary("epic.updateArtifactStatus", {
      mutationKey: epicMutationKeys.updateArtifactStatus(),
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
      onSuccess: (_data, variables) => {
        useTicketStatusHoldsStore
          .getState()
          .hold(
            ticketKey(variables.epicId, variables.artifactId),
            variables.status,
          );
      },
      onError: (error) => {
        toastFromHostError(error, "Couldn't update the ticket.");
      },
      onSettled: () => {
        void queryClient.invalidateQueries({ predicate: isTicketRead });
      },
    }),
  );
}

/** A ticket list read, on any host. */
function isTicketRead(query: Query): boolean {
  return hostQueryKeys.matchesMethodOnAnyHost(
    query.queryKey,
    "epic.mentionTickets",
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
