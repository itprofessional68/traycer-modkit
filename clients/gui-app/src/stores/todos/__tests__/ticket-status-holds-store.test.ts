import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ticketKey } from "@/lib/todos/group-todos";
import {
  TICKET_STATUS_HOLD_MS,
  useTicketStatusHoldsStore,
} from "@/stores/todos/ticket-status-holds-store";

const FIRST = ticketKey("task-a", "ticket-1");
const SECOND = ticketKey("task-a", "ticket-2");

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

  it("replaces a hold and expires it 30 seconds after the replacement", () => {
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    vi.advanceTimersByTime(20_000);
    useTicketStatusHoldsStore.getState().hold(FIRST, 0);

    vi.advanceTimersByTime(10_000);
    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      0,
    );

    vi.advanceTimersByTime(19_999);
    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      0,
    );

    vi.advanceTimersByTime(1);
    expect(useTicketStatusHoldsStore.getState().holds.has(FIRST)).toBe(false);
  });

  it("keeps holds and timers scoped to their ticket keys", () => {
    useTicketStatusHoldsStore.getState().hold(FIRST, 2);
    useTicketStatusHoldsStore.getState().hold(SECOND, 1);
    vi.advanceTimersByTime(20_000);
    useTicketStatusHoldsStore.getState().hold(FIRST, 0);

    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      0,
    );
    expect(useTicketStatusHoldsStore.getState().holds.get(SECOND)?.status).toBe(
      1,
    );

    vi.advanceTimersByTime(10_000);
    expect(useTicketStatusHoldsStore.getState().holds.has(SECOND)).toBe(false);
    expect(useTicketStatusHoldsStore.getState().holds.get(FIRST)?.status).toBe(
      0,
    );

    vi.advanceTimersByTime(20_000);
    expect(useTicketStatusHoldsStore.getState().holds.size).toBe(0);
  });
});
