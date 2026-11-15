import type { RequestOfMethod } from "@traycer-clients/shared/host-transport/host-messenger";
import { useHostQuery } from "@/hooks/host/use-host-query";
import { useHostClient, type HostRpcRegistry } from "@/lib/host";
import { hostQueryKeys } from "@/lib/query-keys";

/**
 * Every ticket the host has indexed, across Tasks: an empty query matches all,
 * and 100 is the method's own ceiling. The only ticket read that spans Tasks,
 * so the To-dos pane shows at most 100, from the Tasks this host knows.
 *
 * Constant params, so the object is hoisted rather than memoized.
 */
const ALL_TICKETS_PARAMS: RequestOfMethod<
  HostRpcRegistry,
  "epic.mentionTickets"
> = { query: "", limit: 100 };

export function allTicketsQueryKey(hostId: string | null) {
  return hostQueryKeys.method<HostRpcRegistry, "epic.mentionTickets">(
    hostId,
    "epic.mentionTickets",
    ALL_TICKETS_PARAMS,
  );
}

/**
 * The To-dos pane's tickets, read through the app-wide host: the pane spans
 * Tasks, so no one Task's session host answers for it. Mount only from the
 * To-dos tab. Refetched when the window regains focus, since a ticket changes
 * in its own Task as often as here.
 */
export function useEpicMentionTicketsQuery() {
  const client = useHostClient();
  return useHostQuery<HostRpcRegistry, "epic.mentionTickets">({
    client,
    method: "epic.mentionTickets",
    params: ALL_TICKETS_PARAMS,
    cacheKeyIdentity: undefined,
    options: { refetchOnWindowFocus: true },
  });
}
