import type { TicketStatus } from "@traycer/protocol/common/registry";
import { create } from "zustand";

/**
 * How long a written status is shown over the host's ticket reads. The reads
 * come from an index that catches up a few seconds after a write, and carry
 * no version to tell a caught-up read from a lagging one, so the hold lasts
 * the whole window rather than until a read agrees.
 */
export const TICKET_STATUS_HOLD_MS = 30_000;

export interface TicketStatusHold {
  readonly status: TicketStatus;
  /**
   * `Date.now()` time the window ends. The hold covers every read that landed
   * before it, so a read cached from inside the window never shows through;
   * the To-dos pane reads its tickets again at this time.
   */
  readonly liftsAt: number;
}

interface TicketStatusHoldsState {
  /** Held statuses by `ticketKey`. */
  readonly holds: ReadonlyMap<string, TicketStatusHold>;
  /**
   * A status write landed: hold `status` for {@link TICKET_STATUS_HOLD_MS}.
   * A later write's hold replaces an earlier one's.
   */
  readonly hold: (key: string, status: TicketStatus) => void;
}

/**
 * Ticket statuses written in this window and confirmed by the host, laid over
 * the To-dos pane's ticket reads so a read taken before the index caught up
 * cannot show the old status. Both writers hold: the pane, and a status write
 * in the ticket's Task, so the newest write in this window is what shows. A
 * hold covers every host's reads: a ticket's ids are the same on all of them.
 * Each read is judged on when it landed, so one host's fresh read does not
 * lift the hold over another host's older one, and a hold is never removed:
 * the map grows only by the tickets written in this window.
 * The cost: another machine's or an agent's change to a ticket written here
 * shows only with the first read after the window. Per window, never persisted.
 */
export const useTicketStatusHoldsStore = create<TicketStatusHoldsState>()(
  (set, get) => ({
    holds: new Map(),
    hold: (key, status) => {
      set({
        holds: new Map(get().holds).set(key, {
          status,
          liftsAt: Date.now() + TICKET_STATUS_HOLD_MS,
        }),
      });
    },
  }),
);

/**
 * The held statuses that apply to a read that landed at `readAt`
 * (`dataUpdatedAt`): those whose window had not ended by then.
 */
export function heldTicketStatuses(
  holds: ReadonlyMap<string, TicketStatusHold>,
  readAt: number,
): ReadonlyArray<readonly [string, TicketStatus]> {
  return [...holds].flatMap(([key, hold]) =>
    readAt < hold.liftsAt ? [[key, hold.status] as const] : [],
  );
}
