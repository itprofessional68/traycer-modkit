import { useState } from "react";
import type { ListTaskLight } from "@traycer/protocol/host/epic/unary-schemas";
import { useEpicGetTaskContexts } from "@/hooks/epic/use-epic-get-task-contexts-query";

export interface UnlistedTodoTasks {
  /** Every Task found so far for this person, by id. */
  readonly tasksById: ReadonlyMap<string, ListTaskLight>;
  /** The found Tasks the host marked local-homed. */
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
 * name. Kept per person: a different `userId` starts empty.
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
    lookup.tasksById.size > 0
  ) {
    setRemembered({
      userId,
      mergedFrom: lookup.tasksById,
      tasksById: new Map([...remembered.tasksById, ...lookup.tasksById]),
      localHomedTaskIds: new Set([
        ...remembered.localHomedTaskIds,
        ...lookup.localHomedTaskIds,
      ]),
    });
  }
  return remembered.userId === userId ? remembered : lookup;
}
