import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { EpicMentionTicketSuggestion } from "@traycer/protocol/host/epic/unary-schemas";
import {
  buildHistoryItemsFromTasks,
  EMPTY_LOCAL_HOMED_TASK_IDS,
} from "@/components/home/data/home-page.data";
import { useTabSurfaceActivity } from "@/components/layout/tab-surface-activity-hooks";
import { TodoRow } from "@/components/todos/todo-row";
import {
  filterTodoGroupsByRepo,
  todoRepoOptions,
  todoReposByEpicId,
  todoTaskTitlesByEpicId,
} from "@/components/todos/todo-tasks";
import { useUnlistedTodoTasks } from "@/components/todos/use-unlisted-todo-tasks";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useEpicMentionTicketsQuery } from "@/hooks/epic/use-epic-mention-tickets-query";
import { usePendingTicketStatuses } from "@/hooks/epic/use-epic-update-artifact-status-direct-mutation";
import { useCloudEpicTasksQuery } from "@/hooks/epics/use-cloud-epic-tasks-query";
import {
  groupTodos,
  ticketKey,
  withWrittenStatuses,
  type TodoFilter,
} from "@/lib/todos/group-todos";
import {
  authorizesCloudCapability,
  useAuthStore,
} from "@/stores/auth/auth-store";
import {
  heldTicketStatuses,
  useTicketStatusHoldsStore,
} from "@/stores/todos/ticket-status-holds-store";

const NO_TICKETS: ReadonlyArray<EpicMentionTicketSuggestion> = [];
const NO_EPIC_IDS: ReadonlyArray<string> = [];
/** The repo filter's "no filter" item; Radix gives `""` its own meaning. */
const ALL_REPOS = "all-repos";

/**
 * The To-dos tab: the tickets the app-wide host has indexed, grouped by
 * Task, to check off. Task names and repos come from the Task list, and for
 * a Task past its first page, from a lookup by id.
 */
export function TodosSurface(): ReactNode {
  const { visible } = useTabSurfaceActivity();
  const tickets = useEpicMentionTicketsQuery(visible);
  const { tasks, currentUserId, firstPagePending } = useCloudEpicTasksQuery(
    undefined,
    {
      enabled: true,
    },
  );
  const [filter, setFilter] = useState<TodoFilter>("open");
  const [pickedRepo, setPickedRepo] = useState<string | null>(null);

  const pending = usePendingTicketStatuses();
  const holds = useTicketStatusHoldsStore((state) => state.holds);
  const readEntries = tickets.data?.entries ?? NO_TICKETS;
  const requestedAt = tickets.data?.requestedAt;
  // A write in flight wins over a hold on the same ticket: it is newer.
  const entries = useMemo(
    () =>
      withWrittenStatuses(
        readEntries,
        new Map([
          ...(requestedAt === undefined
            ? []
            : heldTicketStatuses(holds, requestedAt)),
          ...pending,
        ]),
      ),
    [readEntries, requestedAt, holds, pending],
  );
  // A hold covers every read sent during its window, so when a window ends
  // the tickets are read again, and the held status shows until a read sent
  // after it lands. A hidden tab reads again when it is next shown.
  const { refetch, isFetching, isError } = tickets;
  useEffect(() => {
    if (!visible || requestedAt === undefined) return;
    const now = Date.now();
    const windowEnds = new Set([...holds.values()].map((hold) => hold.liftsAt));
    // A window that has ended still covers this read: with nothing cached
    // (a host just switched to), the read in flight when it ended is joined
    // rather than restarted, and lands here. A failed read waits for the next
    // show or focus instead of retrying here.
    const covered = [...windowEnds].some(
      (end) => end <= now && requestedAt < end,
    );
    if (covered && !isFetching && !isError) {
      void refetch();
      return;
    }
    const timers = [...windowEnds]
      .filter((end) => end > now)
      .map((end) =>
        setTimeout(() => {
          void refetch();
        }, end - now),
      );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [holds, visible, requestedAt, isFetching, isError, refetch]);
  // `nowMs` only feeds the items' time labels, which this surface never shows.
  const listedItems = useMemo(
    () =>
      buildHistoryItemsFromTasks(
        tasks,
        0,
        currentUserId,
        EMPTY_LOCAL_HOMED_TASK_IDS,
      ),
    [tasks, currentUserId],
  );
  // The Task list is its first page, and tickets come from any Task the host
  // has indexed: the rest are looked up by id, as History does, once the first
  // page or its cached copy is shown (before it, every ticket's Task would be
  // asked for).
  const unlistedEpicIds = useMemo(() => {
    if (firstPagePending) return NO_EPIC_IDS;
    const listed = new Set(listedItems.map((item) => item.epicId));
    return [...new Set(readEntries.map((entry) => entry.epicId))]
      .filter((epicId) => !listed.has(epicId))
      .toSorted((left, right) => left.localeCompare(right));
  }, [firstPagePending, listedItems, readEntries]);
  const cloudAuthorized = useAuthStore((state) =>
    authorizesCloudCapability(state.status),
  );
  const unlisted = useUnlistedTodoTasks(
    unlistedEpicIds,
    currentUserId,
    cloudAuthorized && visible,
  );
  const taskItems = useMemo(() => {
    const unlistedTasks = unlistedEpicIds.flatMap((epicId) => {
      const task = unlisted.tasksById.get(epicId);
      return task === undefined ? [] : [task];
    });
    return unlistedTasks.length === 0
      ? listedItems
      : [
          ...listedItems,
          ...buildHistoryItemsFromTasks(
            unlistedTasks,
            0,
            currentUserId,
            unlisted.localHomedTaskIds,
          ),
        ];
  }, [
    listedItems,
    unlistedEpicIds,
    unlisted.tasksById,
    unlisted.localHomedTaskIds,
    currentUserId,
  ]);
  const reposByEpicId = useMemo(
    () => todoReposByEpicId(taskItems),
    [taskItems],
  );
  const titlesByEpicId = useMemo(
    () => todoTaskTitlesByEpicId(taskItems),
    [taskItems],
  );
  const allGroups = useMemo(() => groupTodos(entries, "all"), [entries]);
  const repoOptions = useMemo(
    () => todoRepoOptions(allGroups, reposByEpicId),
    [allGroups, reposByEpicId],
  );
  // A repo that has gone from the list stops filtering rather than hiding
  // every ticket behind a choice the picker no longer shows.
  const repo =
    pickedRepo !== null && repoOptions.includes(pickedRepo) ? pickedRepo : null;
  const groups = useMemo(
    () =>
      filterTodoGroupsByRepo(
        filter === "all" ? allGroups : groupTodos(entries, "open"),
        reposByEpicId,
        repo,
      ),
    [allGroups, entries, reposByEpicId, filter, repo],
  );

  return (
    <div
      className="flex h-full min-h-0 w-full flex-col gap-4 overflow-y-auto p-6"
      data-testid="todos-surface"
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-ui-lg font-semibold">To-dos</h1>
        <p className="text-ui-xs text-muted-foreground">
          Shows up to 100 tickets from the Tasks this machine knows.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Tabs
          value={filter}
          onValueChange={(next) => {
            if (next === "open" || next === "all") setFilter(next);
          }}
        >
          <TabsList aria-label="Tickets to show">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        {repoOptions.length > 0 ? (
          <Select
            value={repo ?? ALL_REPOS}
            onValueChange={(next) => {
              setPickedRepo(next === ALL_REPOS ? null : next);
            }}
          >
            <SelectTrigger aria-label="Repo" size="sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_REPOS}>All repos</SelectItem>
              {repoOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
      {tickets.data === undefined && !tickets.isError ? (
        <AgentSpinningDots
          className={undefined}
          testId="todos-loading"
          variant={undefined}
          tone="muted"
        />
      ) : null}
      {tickets.isError ? (
        <p className="text-ui-sm text-muted-foreground">
          Couldn&apos;t load your tickets.
        </p>
      ) : null}
      {tickets.data !== undefined && groups.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">
          {filter === "open"
            ? "No open tickets in this view."
            : "No tickets in this view."}
        </p>
      ) : null}
      {groups.map((group) => {
        const repos = reposByEpicId.get(group.epicId) ?? [];
        const title = titlesByEpicId.get(group.epicId) ?? group.epicTitle;
        return (
          <section
            key={group.epicId}
            aria-label={title}
            className="flex flex-col gap-1"
          >
            <h2 className="flex min-w-0 items-baseline gap-2 text-ui-xs font-medium text-muted-foreground">
              <span className="truncate">{title}</span>
              {repos.length > 0 ? (
                <span className="truncate font-normal">{repos.join(", ")}</span>
              ) : null}
            </h2>
            <ul className="flex flex-col gap-1">
              {group.rows.map((row) => (
                <TodoRow
                  key={row.artifactId}
                  row={row}
                  pending={pending.has(ticketKey(row.epicId, row.artifactId))}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
