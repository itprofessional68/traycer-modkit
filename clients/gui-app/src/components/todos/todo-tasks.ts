import { historyItemDisplayTitle } from "@/components/epics/history-item-title";
import type { HistoryItem } from "@/components/home/data/home-page.data";
import type { TodoGroup } from "@/lib/todos/group-todos";

/**
 * Each Task's name as History shows it, by Task id. Preferred over the name
 * the ticket read carries, which a host that has not named the Task fills
 * with "Epic <id>".
 */
export function todoTaskTitlesByEpicId(
  items: ReadonlyArray<HistoryItem>,
): ReadonlyMap<string, string> {
  return new Map(
    items.map((item) => [item.epicId, historyItemDisplayTitle(item)]),
  );
}

/**
 * Each Task's linked repos (`owner/repo`), by Task id. A Task the pane could
 * not find (not on the Task list's first page, and its lookup by id not
 * answered or not allowed) shows no repo and matches no repo filter.
 *
 * No edit right is read here: every role a person can hold on a Task may
 * change it, and the host refuses a write that is not theirs to make.
 */
export function todoReposByEpicId(
  items: ReadonlyArray<HistoryItem>,
): ReadonlyMap<string, ReadonlyArray<string>> {
  return new Map(items.map((item) => [item.epicId, item.linkedRepos]));
}

/** Every repo linked to a Task in `groups`, sorted, for the repo filter. */
export function todoRepoOptions(
  groups: ReadonlyArray<TodoGroup>,
  reposByEpicId: ReadonlyMap<string, ReadonlyArray<string>>,
): ReadonlyArray<string> {
  const repos = new Set(
    groups.flatMap((group) => reposByEpicId.get(group.epicId) ?? []),
  );
  return [...repos].toSorted((left, right) => left.localeCompare(right));
}

/** The groups whose Task is linked to `repo`; all of them when `null`. */
export function filterTodoGroupsByRepo(
  groups: ReadonlyArray<TodoGroup>,
  reposByEpicId: ReadonlyMap<string, ReadonlyArray<string>>,
  repo: string | null,
): ReadonlyArray<TodoGroup> {
  if (repo === null) return groups;
  const linked = new Set(
    [...reposByEpicId]
      .filter(([, repos]) => repos.includes(repo))
      .map(([epicId]) => epicId),
  );
  return groups.filter((group) => linked.has(group.epicId));
}
