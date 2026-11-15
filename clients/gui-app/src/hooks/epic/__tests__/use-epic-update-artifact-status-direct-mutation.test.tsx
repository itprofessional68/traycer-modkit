import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EpicMentionTicketsResponse } from "@traycer/protocol/host/epic/unary-schemas";
import { nextCallOf } from "@/__tests__/next-call";
import type { HostRpcRegistry } from "@/lib/host";
import { hostQueryKeys } from "@/lib/query-keys";
import { useEpicUpdateArtifactStatusDirectForClient } from "@/hooks/epic/use-epic-update-artifact-status-direct-mutation";

const HOST = "host-1";

/** The To-dos pane's read: every ticket, up to the method's 100. */
const TICKETS_KEY = hostQueryKeys.method<
  HostRpcRegistry,
  "epic.mentionTickets"
>(HOST, "epic.mentionTickets", { query: "", limit: 100 });

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
  ],
};

const DONE = { epicId: "task-a", artifactId: "ticket-1", status: 2 } as const;

function renderWrite() {
  const queryClient = new QueryClient();
  queryClient.setQueryData(TICKETS_KEY, TICKETS);
  const client = { getActiveHostId: () => HOST, request: hoisted.request };
  const view = renderHook(
    () => useEpicUpdateArtifactStatusDirectForClient(client),
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
  const cachedStatus = () =>
    queryClient.getQueryData<EpicMentionTicketsResponse>(TICKETS_KEY)
      ?.entries[0].status;
  return { ...view, cachedStatus };
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

  it("checks the ticket off at once and writes it to the host when its Task is not open", async () => {
    hoisted.peek.mockReturnValue(null);
    const answer = deferred();
    const requested = nextRequest(answer.promise);
    const { result, cachedStatus } = renderWrite();

    const written = result.current.mutateAsync(DONE);
    const [method, params] = await requested;
    expect(cachedStatus()).toBe(2);
    answer.resolve({ updated: true });
    await written;

    expect([method, params]).toEqual([
      "epic.updateArtifactStatus",
      {
        epicId: "task-a",
        artifactId: "ticket-1",
        artifactType: "ticket",
        status: 2,
      },
    ]);
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

  it("puts the ticket back and says so when the host refuses, after the row is gone", async () => {
    hoisted.peek.mockReturnValue(null);
    const answer = deferred();
    const requested = nextRequest(answer.promise);
    const { result, unmount, cachedStatus } = renderWrite();
    const refused = nextCallOf(hoisted.toastFromHostError);

    result.current.mutate(DONE);
    await requested;
    unmount();
    answer.reject(new Error("view-only"));

    const [, fallback] = await refused;
    expect(fallback).toBe("Couldn't update the ticket.");
    expect(cachedStatus()).toBe(0);
  });
});
