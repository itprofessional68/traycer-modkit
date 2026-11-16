import type { TicketStatus } from "@traycer/protocol/common/registry";
import { create } from "zustand";

/**
 * How long a written status is shown over the host's ticket reads. The reads
 * come from an index that catches up a few seconds after a write, and carry
 * no version to tell a caught-up read from a lagging one, so the hold lasts
 * the whole window rather than until a read agrees.
 */
export const TICKET_STATUS_HOLD_MS = 30_000;

interface TicketStatusHold {
  readonly status: TicketStatus;
  readonly expiry: Parameters<typeof clearTimeout>[0];
}

interface TicketStatusHoldsState {
  /** Held statuses by `ticketKey`. */
  readonly holds: ReadonlyMap<string, TicketStatusHold>;
  /**
   * A status write landed: show `status` for {@link TICKET_STATUS_HOLD_MS}.
   * A later write's hold replaces an earlier one's, timer and all.
   */
  readonly hold: (key: string, status: TicketStatus) => void;
}

/**
 * Ticket statuses written in this window and confirmed by the host, laid over
 * the To-dos pane's ticket reads so a read taken before the index caught up
 * cannot show the old status. Both writers hold: the pane, and a status write
 * in the ticket's Task, so the newest write in this window is what shows. A
 * hold covers every host's reads: a ticket's ids are the same on all of them.
 * The cost: another machine's or an agent's change to a ticket written here
 * shows only once the hold lifts. Per window, never persisted.
 */
export const useTicketStatusHoldsStore = create<TicketStatusHoldsState>()(
  (set, get) => ({
    holds: new Map(),
    hold: (key, status) => {
      const replaced = get().holds.get(key);
      if (replaced !== undefined) clearTimeout(replaced.expiry);
      const expiry = setTimeout(() => {
        if (get().holds.get(key)?.expiry !== expiry) return;
        const holds = new Map(get().holds);
        holds.delete(key);
        set({ holds });
      }, TICKET_STATUS_HOLD_MS);
      set({ holds: new Map(get().holds).set(key, { status, expiry }) });
    },
  }),
);
