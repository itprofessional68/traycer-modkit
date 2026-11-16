import type { TicketStatus } from "@traycer/protocol/common/registry";
import { create } from "zustand";

/**
 * How long a written status is trusted over the host's ticket read. The read
 * comes from an index that catches up a few seconds after a write; this is
 * the backstop for a read that never agrees.
 */
export const TICKET_STATUS_HOLD_MS = 30_000;

interface TicketStatusHold {
  readonly status: TicketStatus;
  /** Tells a hold's own expiry apart from a later hold on the same ticket. */
  readonly id: number;
}

interface TicketStatusHoldsState {
  /** Held statuses by `ticketKey`. */
  readonly holds: ReadonlyMap<string, TicketStatusHold>;
  /** A To-dos write landed: show `status` until a read agrees. */
  readonly hold: (key: string, status: TicketStatus) => void;
  /** A status write in the ticket's Task supersedes the hold. */
  readonly release: (key: string) => void;
  /** Lift every hold the host's read now agrees with. */
  readonly releaseAgreed: (statuses: ReadonlyMap<string, TicketStatus>) => void;
}

let nextHoldId = 0;

/**
 * Statuses the To-dos pane wrote and the host confirmed, laid over its ticket
 * reads until a read agrees, a status write in the ticket's Task replaces it,
 * or {@link TICKET_STATUS_HOLD_MS} passes. Without it, the read taken as the
 * write settles shows the old status for a few seconds. Per window, never
 * persisted: a hold outlives no reload.
 */
export const useTicketStatusHoldsStore = create<TicketStatusHoldsState>()(
  (set, get) => ({
    holds: new Map(),
    hold: (key, status) => {
      nextHoldId += 1;
      const id = nextHoldId;
      set({ holds: new Map(get().holds).set(key, { status, id }) });
      setTimeout(() => {
        if (get().holds.get(key)?.id !== id) return;
        get().release(key);
      }, TICKET_STATUS_HOLD_MS);
    },
    release: (key) => {
      if (!get().holds.has(key)) return;
      const holds = new Map(get().holds);
      holds.delete(key);
      set({ holds });
    },
    releaseAgreed: (statuses) => {
      const agreed = [...get().holds].filter(
        ([key, hold]) => statuses.get(key) === hold.status,
      );
      if (agreed.length === 0) return;
      const holds = new Map(get().holds);
      for (const [key] of agreed) holds.delete(key);
      set({ holds });
    },
  }),
);
