import { useMemo, type ReactNode } from "react";
import { useEpicMentionTicketsQuery } from "@/hooks/epic/use-epic-mention-tickets-query";
import { groupTodos } from "@/lib/todos/group-todos";

/**
 * The To-dos tab: every open ticket the app-wide host has indexed, grouped
 * by Task.
 */
export function TodosSurface(): ReactNode {
  const tickets = useEpicMentionTicketsQuery();
  const groups = useMemo(
    () => groupTodos(tickets.data?.entries ?? [], "open"),
    [tickets.data],
  );
  return (
    <div
      className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-6"
      data-testid="todos-surface"
    >
      <h1 className="text-ui-lg font-semibold">To-dos</h1>
      {tickets.isError ? (
        <p className="text-ui-sm text-muted-foreground">
          Couldn&apos;t load your tickets.
        </p>
      ) : null}
      {tickets.data !== undefined && groups.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">Nothing left to do.</p>
      ) : null}
      {groups.map((group) => (
        <section key={group.epicId} className="flex flex-col gap-1">
          <h2 className="text-ui-xs font-medium text-muted-foreground">
            {group.epicTitle}
          </h2>
          <ul className="flex flex-col gap-1">
            {group.rows.map((row) => (
              <li key={row.artifactId} className="text-ui-sm">
                {row.title}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
