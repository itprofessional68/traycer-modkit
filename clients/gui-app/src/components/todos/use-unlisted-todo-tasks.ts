import { useState } from "react";
import type { ListTaskLight } from "@traycer/protocol/host/epic/unary-schemas";
import { useEpicGetTaskContexts } from "@/hooks/epic/use-epic-get-task-contexts-query";

export interface UnlistedTodoTasks {
  /** The Tasks found for this person, by id. */
  readonly tasksById: ReadonlyMap<string, ListTaskLight>;
  /** The found Tasks the host marked local-homed in its latest answer. */
  readonly localHomedTaskIds: ReadonlySet<string>;
}

interface Remembered extends UnlistedTodoTasks {
  readonly userId: string | null;
  /** The lookup answer last merged in, so each answer merges once. */
  readonly mergedFrom: ReadonlyMap<string, ListTaskLight> | null;
}

/**
 * The To-dos pane's Tasks that are not on the Task list's first page, looked
 * up by id as History does. The lookup's key is the id set, so a new Task's
 * ticket or a reshuffled first page starts a new lookup; the Tasks already
 * found are kept meanwhile rather than falling back to the ticket read's
 * name. A complete answer that no longer finds a Task (deleted, or no longer
 * the person's to see) drops it. Kept per person: a different `userId` starts
 * empty.
 *
 * `enabled` is the cloud verdict and the caller's own gates; the lookup also
 * needs a known user and at least one id.
 */
export function useUnlistedTodoTasks(
  epicIds: readonly string[],
  userId: string | null,
  enabled: boolean,
): UnlistedTodoTasks {
  const lookup = useEpicGetTaskContexts(epicIds, userId, { enabled });
  const [remembered, setRemembered] = useState<Remembered>(() => ({
    userId,
    mergedFrom: null,
    tasksById: new Map(),
    localHomedTaskIds: new Set(),
  }));
  const answered =
    epicIds.length > 0 && !lookup.isPending && lookup.error === null;
  // Merged during render, as React's "storing information from previous
  // renders" pattern does, so a fresh answer shows in the same render.
  if (remembered.userId !== userId) {
    setRemembered({
      userId,
      mergedFrom: null,
      tasksById: new Map(),
      localHomedTaskIds: new Set(),
    });
  } else if (
    remembered.mergedFrom !== lookup.tasksById &&
    (lookup.tasksById.size > 0 || answered)
  ) {
    setRemembered(
      mergeAnswer(remembered, lookup, answered ? epicIds : NO_EPIC_IDS),
    );
  }
  return remembered.userId === userId ? remembered : lookup;
}

const NO_EPIC_IDS: readonly string[] = [];

/**
 * `remembered` with `answer` laid over it: each Task it found, with its
 * local-homed mark, and none of `askedFor` it did not find.
 */
function mergeAnswer(
  remembered: Remembered,
  answer: UnlistedTodoTasks,
  askedFor: readonly string[],
): Remembered {
  const tasksById = new Map(remembered.tasksById);
  const localHomedTaskIds = new Set(remembered.localHomedTaskIds);
  for (const epicId of askedFor) {
    if (answer.tasksById.has(epicId)) continue;
    tasksById.delete(epicId);
    localHomedTaskIds.delete(epicId);
  }
  for (const [epicId, task] of answer.tasksById) {
    tasksById.set(epicId, task);
    if (answer.localHomedTaskIds.has(epicId)) localHomedTaskIds.add(epicId);
    else localHomedTaskIds.delete(epicId);
  }
  return {
    userId: remembered.userId,
    mergedFrom: answer.tasksById,
    tasksById,
    localHomedTaskIds,
  };
}
