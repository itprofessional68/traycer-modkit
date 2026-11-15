import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpicMentionTicketsResponse } from "@traycer/protocol/host/epic/unary-schemas";
import { nextCallOf } from "@/__tests__/next-call";
import type { HostRpcRegistry } from "@/lib/host";
import { hostQueryKeys } from "@/lib/query-keys";
import {
  useEpicUpdateArtifactStatusDirectForClient,
  usePendingTicketStatuses,
} from "@/hooks/epic/use-epic-update-artifact-status-direct-mutation";
import { ticketKey } from "@/lib/todos/group-todos";

const HOST = "host-1";

/** The To-dos pane's read: every ticket, up to the method's 100. */
const TICKETS_KEY = hostQueryKeys.method<
  HostRpcRegistry,
  "epic.mentionTickets"
>(HOST, "epic.mentionTickets", { query: "", limit: 100 });
const OTHER_TICKETS_KEY = hostQueryKeys.method<
  HostRpcRegistry,
  "epic.mentionTickets"
>("host-2", "epic.mentionTickets", { query: "", limit: 100 });

const hoisted = await vi.hoisted(async () => {
  const { createStore } = await import("zustand/vanilla");
  const queue = {
    enqueueWriteCommand: vi.fn<(intent: unknown) => Promise<string | null>>(),
    waitForWriteCommand: vi.fn<(commandId: string) => Promise<unknown>>(),
  };
  return {
    // Untyped: the client's `request` is generic over every host method.
    request: vi.fn(),
    // An open Task's handle: only its write queue is read.
    openTask: { store: createStore(() => queue) },
    queue,
    peek: vi.fn<(epicId: string) => unknown>(),
    toastFromHostError: vi.fn<(error: unknown, fallback: string) => void>(),
  };
});

vi.mock("@/lib/registries/epic-session-registry", () => ({
  getOpenEpicRegistry: () => ({ peek: hoisted.peek }),
  isEpicSessionHandleDead: () => false,
}));
vi.mock("@/lib/host-error-toast", () => ({
  toastFromHostError: hoisted.toastFromHostError,
}));

const TICKETS: EpicMentionTicketsResponse = {
  entries: [
    {
      kind: "epic-artifact",
      id: "row-1",
      token: "token",
      epicId: "task-a",
      epicTitle: "Task A",
      artifactId: "ticket-1",
      artifactType: "ticket",
      label: "Write the store",
      description: "",
      status: 0,
      updatedAt: 1,
    },
    {
      kind: "epic-artifact",
      id: "row-2",
      token: "token-2",
      epicId: "task-a",
      epicTitle: "Task A",
      artifactId: "ticket-2",
      artifactType: "ticket",
      label: "Wire the route",
      description: "",
      status: 0,
      updatedAt: 1,
    },
  ],
};

const DONE = { epicId: "task-a", artifactId: "ticket-1", status: 2 } as const;
const STARTED = {
  epicId: "task-a",
  artifactId: "ticket-2",
  status: 1,
} as const;

function renderWrite() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(TICKETS_KEY, TICKETS);
  queryClient.setQueryData(OTHER_TICKETS_KEY, TICKETS);
  let currentHost = HOST;
  const client = {
    getActiveHostId: () => currentHost,
    request: hoisted.request,
  };
  const view = renderHook(
    () => {
      const mutation = useEpicUpdateArtifactStatusDirectForClient(client);
      const pending = usePendingTicketStatuses();
      return { ...mutation, pending };
    },
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
  const cachedStatusOf = (artifactId: string, hostId: string) =>
    queryClient
      .getQueryData<EpicMentionTicketsResponse>(
        hostId === HOST ? TICKETS_KEY : OTHER_TICKETS_KEY,
      )
      ?.entries.find((entry) => entry.artifactId === artifactId)?.status;
  const cachedStatus = () => cachedStatusOf("ticket-1", HOST);
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  return {
    ...view,
    cachedStatus,
    cachedStatusOf,
    invalidate,
    setCurrentHost: (hostId: string) => {
      currentHost = hostId;
    },
  };
}

/**
 * The host's next request, answered with `answer` once it arrives: resolves
 * with the request so a test can act while the host has not answered yet.
 */
function nextRequest(answer: Promise<unknown>): Promise<[string, unknown]> {
  return new Promise((resolve) => {
    hoisted.request.mockImplementationOnce(
      (method: string, params: unknown) => {
        resolve([method, params]);
        return answer;
      },
    );
  });
}

function deferred() {
  let resolve: (value: unknown) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("useEpicUpdateArtifactStatusDirectForClient", () => {
  afterEach(() => {
    hoisted.request.mockReset();
    hoisted.peek.mockReset();
    hoisted.queue.enqueueWriteCommand.mockReset();
    hoisted.queue.waitForWriteCommand.mockReset();
    hoisted.toastFromHostError.mockReset();
  });

  it("keeps the read unchanged while pending, then patches and invalidates every host on success", async () => {
    hoisted.peek.mockReturnValue(null);
    const answer = deferred();
    const requested = nextRequest(answer.promise);
    const view = renderWrite();

    let written = Promise.resolve();
    let requestArgs: [string, unknown] | undefined;
    await act(async () => {
      written = view.result.current.mutateAsync(DONE);
      requestArgs = await requested;
    });
    view.rerender();
    expect(view.cachedStatusOf("ticket-1", HOST)).toBe(0);
    expect(view.cachedStatusOf("ticket-1", "host-2")).toBe(0);
    expect(
      view.result.current.pending.get(ticketKey("task-a", "ticket-1")),
    ).toBe(2);

    await act(async () => {
      answer.resolve({ updated: true });
      await written;
    });
    view.rerender();

    expect(requestArgs).toEqual([
      "epic.updateArtifactStatus",
      {
        epicId: "task-a",
        artifactId: "ticket-1",
        artifactType: "ticket",
        status: 2,
      },
    ]);
    expect(view.cachedStatusOf("ticket-1", HOST)).toBe(2);
    expect(view.cachedStatusOf("ticket-1", "host-2")).toBe(0);
    expect(
      view.result.current.pending.has(ticketKey("task-a", "ticket-1")),
    ).toBe(false);
    expect(view.invalidate).toHaveBeenCalledTimes(1);
    const { predicate } = view.invalidate.mock.calls[0][0] as {
      predicate: (query: { queryKey: unknown }) => boolean;
    };
    for (const hostId of [HOST, "host-2"]) {
      expect(
        predicate({
          queryKey: hostQueryKeys.method(hostId, "epic.mentionTickets", {
            query: "",
            limit: 100,
          }),
        }),
      ).toBe(true);
    }
    expect(
      predicate({
        queryKey: hostQueryKeys.method(HOST, "epic.listArtifacts", {}),
      }),
    ).toBe(false);
  });

  it("keeps the read unchanged and shows a toast when the host refuses", async () => {
    hoisted.peek.mockReturnValue(null);
    const answer = deferred();
    const requested = nextRequest(answer.promise);
    const view = renderWrite();
    const { result, cachedStatus, invalidate } = view;
    const refused = nextCallOf(hoisted.toastFromHostError);

    let written = Promise.resolve();
    await act(async () => {
      written = result.current.mutateAsync(DONE);
      await requested;
    });
    view.rerender();
    expect(cachedStatus()).toBe(0);
    expect(result.current.pending.get(ticketKey("task-a", "ticket-1"))).toBe(2);

    await act(async () => {
      answer.reject(new Error("view-only"));
      await expect(written).rejects.toThrow("view-only");
      await refused;
    });
    view.rerender();

    expect(cachedStatus()).toBe(0);
    expect(result.current.pending.has(ticketKey("task-a", "ticket-1"))).toBe(
      false,
    );
    expect(hoisted.toastFromHostError).toHaveBeenCalledWith(
      expect.anything(),
      "Couldn't update the ticket.",
    );
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("writes through the open Task's own queue, not to the host", async () => {
    hoisted.peek.mockReturnValue(hoisted.openTask);
    hoisted.queue.enqueueWriteCommand.mockResolvedValue("command-1");
    hoisted.queue.waitForWriteCommand.mockResolvedValue({ state: "committed" });
    const { result } = renderWrite();

    await result.current.mutateAsync(DONE);

    expect(hoisted.peek).toHaveBeenCalledWith("task-a");
    expect(hoisted.queue.enqueueWriteCommand).toHaveBeenCalledWith({
      kind: "update-artifact-status",
      artifactId: "ticket-1",
      artifactType: "ticket",
      status: 2,
    });
    expect(hoisted.request).not.toHaveBeenCalled();
  });

  it("keeps the ticket read unchanged and says so when the open Task's queue refuses the write", async () => {
    hoisted.peek.mockReturnValue(hoisted.openTask);
    hoisted.queue.enqueueWriteCommand.mockResolvedValue(null);
    const { result, cachedStatus } = renderWrite();
    const refused = nextCallOf(hoisted.toastFromHostError);

    result.current.mutate(DONE);

    const [error, fallback] = await refused;
    expect(error).toMatchObject({
      message: "The write was refused by the current epic projection",
    });
    expect(fallback).toBe("Couldn't update the ticket.");
    expect(cachedStatus()).toBe(0);
    expect(hoisted.queue.waitForWriteCommand).not.toHaveBeenCalled();
    expect(hoisted.request).not.toHaveBeenCalled();
  });

  it("keeps the ticket read unchanged when the open Task's host rejects the write", async () => {
    hoisted.peek.mockReturnValue(hoisted.openTask);
    hoisted.queue.enqueueWriteCommand.mockResolvedValue("command-1");
    hoisted.queue.waitForWriteCommand.mockResolvedValue({
      state: "rejected",
      resolution: { kind: "rejected", code: "FORBIDDEN", reason: "view-only" },
    });
    const { result, cachedStatus } = renderWrite();
    const refused = nextCallOf(hoisted.toastFromHostError);

    result.current.mutate(DONE);

    const [error] = await refused;
    expect(error).toMatchObject({ message: "view-only" });
    expect(cachedStatus()).toBe(0);
  });

  describe("with two writes in flight", () => {
    function startBoth() {
      hoisted.peek.mockReturnValue(null);
      const first = deferred();
      const second = deferred();
      const firstRequested = nextRequest(first.promise);
      const secondRequested = nextRequest(second.promise);
      const view = renderWrite();
      const writeFirst = view.result.current.mutateAsync(DONE);
      const writeSecond = view.result.current.mutateAsync(STARTED);
      return {
        ...view,
        first,
        second,
        writeFirst,
        writeSecond,
        requested: Promise.all([firstRequested, secondRequested]),
      };
    }

    it("reports both pending statuses without editing reads, then settles each independently", async () => {
      const view = startBoth();
      await view.requested;
      view.rerender();
      expect(view.cachedStatusOf("ticket-1", HOST)).toBe(0);
      expect(view.cachedStatusOf("ticket-2", HOST)).toBe(0);
      expect(
        view.result.current.pending.get(ticketKey("task-a", "ticket-1")),
      ).toBe(2);
      expect(
        view.result.current.pending.get(ticketKey("task-a", "ticket-2")),
      ).toBe(1);

      view.first.reject(new Error("view-only"));
      await expect(view.writeFirst).rejects.toThrow("view-only");
      view.rerender();

      expect(view.cachedStatusOf("ticket-1", HOST)).toBe(0);
      expect(view.cachedStatusOf("ticket-2", HOST)).toBe(0);
      expect(
        view.result.current.pending.has(ticketKey("task-a", "ticket-1")),
      ).toBe(false);
      expect(
        view.result.current.pending.get(ticketKey("task-a", "ticket-2")),
      ).toBe(1);
      expect(view.invalidate).toHaveBeenCalledTimes(1);

      view.second.resolve({ updated: true });
      await view.writeSecond;
      view.rerender();

      expect(view.cachedStatusOf("ticket-2", HOST)).toBe(1);
      expect(view.invalidate).toHaveBeenCalledTimes(2);
    });
  });

  it("invalidates the new host's tickets when the app-wide host changes during a write", async () => {
    hoisted.peek.mockReturnValue(null);
    const answer = deferred();
    const requested = nextRequest(answer.promise);
    const view = renderWrite();
    let written = Promise.resolve();

    await act(async () => {
      written = view.result.current.mutateAsync(DONE);
      await requested;
    });
    view.setCurrentHost("host-2");
    await act(async () => {
      answer.resolve({ updated: true });
      await written;
    });

    expect(view.cachedStatusOf("ticket-1", HOST)).toBe(2);
    expect(view.cachedStatusOf("ticket-1", "host-2")).toBe(0);
    expect(view.invalidate).toHaveBeenCalledTimes(1);
    const { predicate } = view.invalidate.mock.calls[0][0] as {
      predicate: (query: { queryKey: unknown }) => boolean;
    };
    expect(
      predicate({
        queryKey: hostQueryKeys.method("host-2", "epic.mentionTickets", {
          query: "",
          limit: 100,
        }),
      }),
    ).toBe(true);
  });
});
