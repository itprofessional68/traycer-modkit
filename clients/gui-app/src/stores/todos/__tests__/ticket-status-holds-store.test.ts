import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ticketKey } from "@/lib/todos/group-todos";
import {
  heldTicketStatuses,
  TICKET_STATUS_HOLD_MS,
  useTicketStatusHoldsStore,
} from "@/stores/todos/ticket-status-holds-store";

const FIRST = ticketKey("task-a", "ticket-1");
const SECOND = ticketKey("task-a", "ticket-2");

function heldAt(readAt: number): ReadonlyMap<string, number> {
  return new Map(
    heldTicketStatuses(useTicketStatusHoldsStore.getState().holds, readAt),
  );
}

describe("ticket status holds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTicketStatusHoldsStore.setState({ holds: new Map() });
  });

  afterEach(() => {
    useTicketStatusHoldsStore.setState({ holds: new Map() });
    vi.useRealTimers();
  });

  it("covers reads that land within 30 seconds of the write, and no later one", () => {
    const placedAt = Date.now();
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);

    expect(heldAt(placedAt)).toEqual(new Map([[FIRST, 2]]));
    expect(heldAt(placedAt + TICKET_STATUS_HOLD_MS - 1)).toEqual(
      new Map([[FIRST, 2]]),
    );
    expect(heldAt(placedAt + TICKET_STATUS_HOLD_MS).size).toBe(0);
  });

  it("keeps covering a read cached inside the window after the window ends", () => {
    const cachedReadAt = Date.now() + 5_000;
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);

    vi.advanceTimersByTime(TICKET_STATUS_HOLD_MS * 2);

    expect(heldAt(cachedReadAt)).toEqual(new Map([[FIRST, 2]]));
  });

  it("replaces a hold's status and window with the newer write's", () => {
    const placedAt = Date.now();
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    vi.advanceTimersByTime(20_000);
    useTicketStatusHoldsStore.getState().hold(FIRST, 0);

    expect(heldAt(placedAt + TICKET_STATUS_HOLD_MS)).toEqual(
      new Map([[FIRST, 0]]),
    );
    expect(heldAt(placedAt + 20_000 + TICKET_STATUS_HOLD_MS).size).toBe(0);
  });

  it("keeps each ticket's window to itself", () => {
    const placedAt = Date.now();
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    vi.advanceTimersByTime(20_000);
    useTicketStatusHoldsStore.getState().hold(SECOND, 1);

    expect(heldAt(placedAt + TICKET_STATUS_HOLD_MS)).toEqual(
      new Map([[SECOND, 1]]),
    );
  });
});
