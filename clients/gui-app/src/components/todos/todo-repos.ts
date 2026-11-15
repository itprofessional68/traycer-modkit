import type { HistoryItem } from "@/components/home/data/home-page.data";
import type { TodoGroup } from "@/lib/todos/group-todos";

/**
 * Each Task's linked repos (`owner/repo`), by Task id. The Task list is one
 * page and the tickets come from any Task the host has indexed, so a ticket's
 * Task can be missing: it then shows no repo and matches no repo filter.
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
