import type { RequestOfMethod } from "@traycer-clients/shared/host-transport/host-messenger";
import { useHostQuery } from "@/hooks/host/use-host-query";
import { useHostClient, type HostRpcRegistry } from "@/lib/host";

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

/**
 * The To-dos pane's tickets, read through the app-wide host: the pane spans
 * Tasks, so no one Task's session host answers for it. Mount only from the
 * To-dos tab.
 *
 * A status write here or in a Task open in this window reads it again; a
 * change by an agent or on another machine tells it nothing. So it is never
 * fresh: it is read again each time the tab is shown (`visible` turning
 * true), when the window regains focus and when a written status's hold
 * ends, and not while the tab is hidden.
 */
export function useEpicMentionTicketsQuery(visible: boolean) {
  const client = useHostClient();
  return useHostQuery<HostRpcRegistry, "epic.mentionTickets">({
    client,
    method: "epic.mentionTickets",
    params: ALL_TICKETS_PARAMS,
    cacheKeyIdentity: undefined,
    options: { enabled: visible, staleTime: 0, refetchOnWindowFocus: true },
  });
}
