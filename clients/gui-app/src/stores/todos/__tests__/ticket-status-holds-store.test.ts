import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ticketKey } from "@/lib/todos/group-todos";
import {
  TICKET_STATUS_HOLD_MS,
  useTicketStatusHoldsStore,
} from "@/stores/todos/ticket-status-holds-store";

const FIRST = ticketKey("task-a", "ticket-1");
const SECOND = ticketKey("task-a", "ticket-2");
const THIRD = ticketKey("task-a", "ticket-3");

describe("ticket status holds", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useTicketStatusHoldsStore.setState({ holds: new Map() });
  });

  afterEach(() => {
    useTicketStatusHoldsStore.setState({ holds: new Map() });
    vi.useRealTimers();
  });

  it("expires a hold at its 30-second limit", () => {
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);

    vi.advanceTimersByTime(TICKET_STATUS_HOLD_MS - 1);
    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      2,
    );

    vi.advanceTimersByTime(1);
    expect(useTicketStatusHoldsStore.getState().holds.has(FIRST)).toBe(false);
  });

  it("does not let an older hold's timer remove a newer hold for the same ticket", () => {
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    vi.advanceTimersByTime(TICKET_STATUS_HOLD_MS - 1);
    useTicketStatusHoldsStore.getState().hold(FIRST, 0);

    vi.advanceTimersByTime(1);
    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      0,
    );

    vi.advanceTimersByTime(TICKET_STATUS_HOLD_MS - 1);
    expect(useTicketStatusHoldsStore.getState().holds.has(FIRST)).toBe(false);
  });

  it("releases one ticket explicitly and only releases holds that agree with a read", () => {
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    useTicketStatusHoldsStore.getState().hold(SECOND, 1);
    useTicketStatusHoldsStore.getState().hold(THIRD, 0);

    useTicketStatusHoldsStore.getState().release(THIRD);
    useTicketStatusHoldsStore.getState().releaseAgreed(
      new Map([
        [FIRST, 2],
        [SECOND, 0],
        [THIRD, 0],
      ]),
    );

    expect(useTicketStatusHoldsStore.getState().holds.has(FIRST)).toBe(false);
    expect(useTicketStatusHoldsStore.getState().holds.get(SECOND)?.status).toBe(
      1,
    );
    expect(useTicketStatusHoldsStore.getState().holds.has(THIRD)).toBe(false);

    useTicketStatusHoldsStore.getState().releaseAgreed(new Map([[SECOND, 1]]));
    expect(useTicketStatusHoldsStore.getState().holds.size).toBe(0);
  });
});
