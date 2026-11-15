import type { TicketStatus } from "@traycer/protocol/common/registry";
import type { EpicMentionTicketSuggestion } from "@traycer/protocol/host/epic/unary-schemas";

/** Which tickets the To-dos pane lists: all, or only those not done. */
export type TodoFilter = "open" | "all";

export interface TodoRow {
  readonly epicId: string;
  readonly artifactId: string;
  readonly title: string;
  readonly status: TicketStatus;
  /** Epoch ms; `0` when the host does not say. */
  readonly updatedAt: number;
}

export interface TodoGroup {
  readonly epicId: string;
  readonly epicTitle: string;
  readonly rows: ReadonlyArray<TodoRow>;
}

/** Status 2 is Done; anything else is still open. */
const TICKET_DONE: TicketStatus = 2;

/**
 * A ticket row's status. The read carries a plain number, `null` for a ticket
 * that never had one set, so anything other than In progress (1) or Done (2)
 * reads as To do (0).
 */
export function ticketStatusOf(status: number | null): TicketStatus {
  if (status === 1 || status === 2) return status;
  return 0;
}

/**
 * Tickets grouped by their Task. Rows are newest first, and Tasks are ordered
 * by their newest row, so the Task worked on last leads. With `open`, done
 * tickets are left out, and a Task with none left is left out with them.
 */
export function groupTodos(
  tickets: ReadonlyArray<EpicMentionTicketSuggestion>,
  filter: TodoFilter,
): ReadonlyArray<TodoGroup> {
  const groups = new Map<string, { epicTitle: string; rows: TodoRow[] }>();
  for (const ticket of tickets) {
    const row: TodoRow = {
      epicId: ticket.epicId,
      artifactId: ticket.artifactId,
      title: ticket.label,
      status: ticketStatusOf(ticket.status),
      updatedAt: ticket.updatedAt ?? 0,
    };
    if (filter === "open" && row.status === TICKET_DONE) continue;
    const group = groups.get(row.epicId);
    if (group === undefined) {
      groups.set(row.epicId, { epicTitle: ticket.epicTitle, rows: [row] });
    } else {
      group.rows.push(row);
    }
  }
  return [...groups.entries()]
    .map(([epicId, group]) => ({
      epicId,
      epicTitle: group.epicTitle,
      rows: group.rows.toSorted((a, b) => b.updatedAt - a.updatedAt),
    }))
    .toSorted((a, b) => b.rows[0].updatedAt - a.rows[0].updatedAt);
}
