import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import {
  focusManager,
  hashKey,
  QueryClient,
  type QueryKey,
  QueryClientProvider,
} from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { NavigateOptions } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EpicMentionTicketSuggestion,
  EpicMentionTicketsResponse,
  ListTaskLight,
} from "@traycer/protocol/host/epic/unary-schemas";
import { nextCallOf } from "@/__tests__/next-call";
import { WithTestQueryClient } from "@/__tests__/with-test-query-client";
import { TabSurfaceActivityContext } from "@/components/layout/tab-surface-activity-context";
import { TodosSurface } from "@/components/todos/todos-surface";
import type { TicketsRead } from "@/hooks/epic/use-epic-mention-tickets-query";
import { taskLight } from "@/lib/view-replica/__tests__/replica-fixtures";
import type { HostRpcRegistry } from "@/lib/host";
import { hostQueryKeys } from "@/lib/query-keys";
import { __resetTabNavigationControllerForTesting } from "@/lib/tab-navigation";
import { resetTabsStoreForTest } from "@/stores/tabs/test-support/tabs-store-fixtures";
import {
  TICKET_STATUS_HOLD_MS,
  useTicketStatusHoldsStore,
} from "@/stores/todos/ticket-status-holds-store";
import { ticketKey } from "@/lib/todos/group-todos";

const fixture = vi.hoisted(() => {
  let activeHostId = "host-1";
  const client = {
    getActiveHostId: () => activeHostId,
    getRequestContext: () => ({}),
    getRequestContextUserId: () => "user-a",
    onChange: () => () => undefined,
    // Untyped: the client's requests are generic over every host method.
    requestWithSignal: vi.fn(),
    request: vi.fn(),
    createRequester: (): unknown => client,
  };
  return {
    client,
    setActiveHostId: (hostId: string) => {
      activeHostId = hostId;
    },
    tasks: new Array<unknown>(),
    navigations: new Array<NavigateOptions>(),
  };
});

vi.mock("@/lib/host", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host")>()),
  useHostClient: () => fixture.client,
}));
vi.mock("@/hooks/epics/use-cloud-epic-tasks-query", () => ({
  useCloudEpicTasksQuery: () => ({
    tasks: fixture.tasks,
    currentUserId: null,
  }),
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => (options: NavigateOptions) => {
    fixture.navigations.push(options);
    return Promise.resolve();
  },
}));

function ticket(
  epicId: string,
  artifactId: string,
  label: string,
  status: number | null,
): EpicMentionTicketSuggestion {
  return {
    kind: "epic-artifact",
    id: artifactId,
    token: artifactId,
    epicId,
    epicTitle: epicId === "task-a" ? "Task A" : "Task B",
    artifactId,
    artifactType: "ticket",
    label,
    description: "",
    status,
    updatedAt: 0,
  };
}

/** Listed in the host's order, which ties on `updatedAt` keep. */
const TICKETS = [
  ticket("task-a", "t-store", "Write the store", 0),
  ticket("task-a", "t-route", "Wire the route", 1),
  ticket("task-a", "t-ship", "Ship it", 2),
  ticket("task-b", "t-docs", "Write the docs", null),
];

const HOST_A_TICKETS_KEY = hostQueryKeys.method<
  HostRpcRegistry,
  "epic.mentionTickets"
>("host-1", "epic.mentionTickets", { query: "", limit: 100 });
const HOST_B_TICKETS_KEY = hostQueryKeys.method<
  HostRpcRegistry,
  "epic.mentionTickets"
>("host-2", "epic.mentionTickets", { query: "", limit: 100 });

/** Task A is linked to acme/web; Task B is not on the Task list's page. */
function taskA(): ListTaskLight {
  const base = taskLight("task-a", null);
  return {
    ...base,
    epic: {
      light: base.epic?.light ? { ...base.epic.light, title: "Task A" } : null,
      permission: null,
      repos: [
        {
          task: null,
          repoIdentifier: { owner: "acme", repo: "web" },
          createdAt: 0,
          createdBy: "user-a",
        },
      ],
      workspaces: [],
      roomInfo: null,
    },
  };
}

function renderSurface() {
  return renderSurfaceWithActivity({ visible: true, focused: true });
}

function renderSurfaceWithActivity(activity: {
  readonly visible: boolean;
  readonly focused: boolean;
}) {
  return render(
    <TabSurfaceActivityContext.Provider value={activity}>
      <TodosSurface />
    </TabSurfaceActivityContext.Provider>,
    { wrapper: WithTestQueryClient },
  );
}

function renderSurfaceWithQueryClient(
  activity: { readonly visible: boolean; readonly focused: boolean },
  queryClient: QueryClient,
) {
  return render(
    <TabSurfaceActivityContext.Provider value={activity}>
      <TodosSurface />
    </TabSurfaceActivityContext.Provider>,
    {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  );
}

function deferred<T>() {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

/** Resolves when the next ticket read under `key` is stored in `queryClient`. */
function nextTicketReadLanded(
  queryClient: QueryClient,
  key: QueryKey,
): Promise<void> {
  const ticketsHash = hashKey(key);
  return new Promise((resolve) => {
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (
        event.type === "updated" &&
        event.action.type === "success" &&
        event.query.queryHash === ticketsHash
      ) {
        unsubscribe();
        resolve();
      }
    });
  });
}

function section(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("TodosSurface", () => {
  beforeEach(() => {
    useTicketStatusHoldsStore.setState({ holds: new Map() });
    resetTabsStoreForTest();
    __resetTabNavigationControllerForTesting();
    fixture.tasks.splice(0, fixture.tasks.length, taskA());
    fixture.setActiveHostId("host-1");
    fixture.client.requestWithSignal.mockResolvedValue({ entries: TICKETS });
    focusManager.setFocused(undefined);
  });

  afterEach(() => {
    cleanup();
    useTicketStatusHoldsStore.setState({ holds: new Map() });
    focusManager.setFocused(undefined);
    vi.useRealTimers();
    __resetTabNavigationControllerForTesting();
    fixture.client.requestWithSignal.mockReset();
    fixture.client.request.mockReset();
    fixture.navigations.splice(0);
  });

  it("lists open tickets by Task, with the Task's repos, and done ones under All", async () => {
    renderSurface();

    const taskAGroup = await screen.findByRole("region", { name: "Task A" });
    expect(within(taskAGroup).getByText("acme/web")).not.toBeNull();
    expect(
      within(taskAGroup)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-label")),
    ).toEqual(["Write the store", "Wire the route"]);
    expect(within(taskAGroup).getByText("In progress")).not.toBeNull();
    expect(
      within(section("Task B")).getByRole("checkbox", {
        name: "Write the docs",
      }),
    ).not.toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));

    const done = within(section("Task A")).getByRole("checkbox", {
      name: "Ship it",
    });
    expect(done.getAttribute("aria-checked")).toBe("true");
  });

  it("checks a ticket off on the host, and it leaves the open list", async () => {
    renderSurface();
    const box = await screen.findByRole("checkbox", {
      name: "Write the store",
    });
    // The host keeps the write: its next ticket read says Done.
    fixture.client.request.mockImplementationOnce(() => {
      fixture.client.requestWithSignal.mockResolvedValue({
        entries: TICKETS.map((entry) =>
          entry.artifactId === "t-store" ? { ...entry, status: 2 } : entry,
        ),
      });
      return Promise.resolve({ updated: true });
    });

    fireEvent.click(box);
    await waitForElementToBeRemoved(box);

    expect(fixture.client.request).toHaveBeenCalledWith(
      "epic.updateArtifactStatus",
      {
        epicId: "task-a",
        artifactId: "t-store",
        artifactType: "ticket",
        status: 2,
      },
    );
  });

  it("sets Done tickets to To do and In progress tickets to Done", async () => {
    renderSurface();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));

    const done = await screen.findByRole("checkbox", { name: "Ship it" });
    const doneWrite = nextCallOf(fixture.client.request);
    fireEvent.click(done);
    expect(await doneWrite).toEqual([
      "epic.updateArtifactStatus",
      {
        epicId: "task-a",
        artifactId: "t-ship",
        artifactType: "ticket",
        status: 0,
      },
    ]);

    const inProgress = screen.getByRole("checkbox", { name: "Wire the route" });
    const inProgressWrite = nextCallOf(fixture.client.request);
    fireEvent.click(inProgress);
    expect(await inProgressWrite).toEqual([
      "epic.updateArtifactStatus",
      {
        epicId: "task-a",
        artifactId: "t-route",
        artifactType: "ticket",
        status: 2,
      },
    ]);
  });

  it("reads tickets when visible and does not read while hidden", async () => {
    const readStarted = vi.fn();
    fixture.client.requestWithSignal.mockImplementation(() => {
      readStarted();
      return Promise.resolve({ entries: TICKETS });
    });
    const initialRead = nextCallOf(readStarted);
    const rendered = renderSurface();
    await act(async () => {
      await initialRead;
    });

    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: false, focused: false }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    vi.useFakeTimers();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(fixture.client.requestWithSignal).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    const visibleRead = nextCallOf(readStarted);
    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: true, focused: true }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    await act(async () => {
      await visibleRead;
    });
    expect(fixture.client.requestWithSignal).toHaveBeenCalledTimes(2);
  });

  it("lets the newest written status hold through lagging reads until its timer expires", async () => {
    const readStarted = vi.fn();
    let readCount = 0;
    const doneEntries = TICKETS.map((entry) =>
      entry.artifactId === "t-store" ? { ...entry, status: 2 } : entry,
    );
    const readAfterHoldAnswer = deferred<EpicMentionTicketsResponse>();
    fixture.client.requestWithSignal.mockImplementation(() => {
      readStarted();
      readCount += 1;
      if (readCount === 4) return readAfterHoldAnswer.promise;
      return Promise.resolve({
        entries: readCount < 3 ? TICKETS : doneEntries,
      });
    });
    const initialRead = nextCallOf(readStarted);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = renderSurfaceWithQueryClient(
      { visible: true, focused: true },
      queryClient,
    );
    await act(async () => {
      await initialRead;
    });

    const box = await screen.findByRole("checkbox", {
      name: "Write the store",
    });
    const answer = deferred<unknown>();
    const writeStarted = vi.fn();
    fixture.client.request.mockImplementation(() => {
      writeStarted();
      return answer.promise;
    });
    const pendingWrite = nextCallOf(writeStarted);
    fireEvent.click(box);
    await pendingWrite;
    await waitForElementToBeRemoved(box);
    vi.useFakeTimers();
    expect(
      screen.queryByRole("checkbox", { name: "Write the store" }),
    ).toBeNull();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    const pendingDone = screen.getByRole("checkbox", {
      name: "Write the store",
    });
    expect(pendingDone.getAttribute("aria-checked")).toBe("true");
    expect(pendingDone.matches(":disabled")).toBe(true);
    const laggingRead = nextCallOf(readStarted);
    const mutationSucceeded = vi.fn();
    const unsubscribeMutation = queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (
          event.type === "updated" &&
          event.mutation.state.status === "success"
        ) {
          mutationSucceeded();
        }
      });
    const successEvent = nextCallOf(mutationSucceeded);
    await act(async () => {
      answer.resolve({ updated: true });
      await Promise.all([laggingRead, successEvent]);
    });
    unsubscribeMutation();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Open" }));
    expect(
      screen.queryByRole("checkbox", { name: "Write the store" }),
    ).toBeNull();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    const staleDone = screen.getByRole("checkbox", {
      name: "Write the store",
    });
    expect(staleDone.getAttribute("aria-checked")).toBe("true");
    expect(staleDone.matches(":disabled")).toBe(false);
    expect(readCount).toBe(2);
    expect(fixture.client.request).toHaveBeenCalledTimes(1);

    act(() => {
      useTicketStatusHoldsStore
        .getState()
        .hold(ticketKey("task-a", "t-store"), 0);
    });
    const todo = screen.getByRole("checkbox", { name: "Write the store" });
    expect(todo.getAttribute("aria-checked")).toBe("false");

    const inTaskRead = nextCallOf(readStarted);
    const refetched = queryClient.invalidateQueries({
      predicate: (query) =>
        hostQueryKeys.matchesMethodOnAnyHost(
          query.queryKey,
          "epic.mentionTickets",
        ),
    });
    await act(async () => {
      await inTaskRead;
      await refetched;
    });
    const laggedOtherDirection = screen.getByRole("checkbox", {
      name: "Write the store",
    });
    expect(laggedOtherDirection.getAttribute("aria-checked")).toBe("false");
    expect(
      useTicketStatusHoldsStore
        .getState()
        .holds.get(ticketKey("task-a", "t-store"))?.status,
    ).toBe(0);

    const readAfterHold = nextCallOf(readStarted);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_STATUS_HOLD_MS);
      await readAfterHold;
    });
    expect(readCount).toBe(4);
    const landed = nextTicketReadLanded(queryClient, HOST_A_TICKETS_KEY);
    await act(async () => {
      readAfterHoldAnswer.resolve({ entries: doneEntries });
      await landed;
      // The query's notifications wait on a zero-delay timer.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      screen
        .getByRole("checkbox", { name: "Write the store" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(fixture.client.request).toHaveBeenCalledTimes(1);
    rendered.unmount();
    queryClient.clear();
  });

  it("reads the tickets again when a hold ends, and holds until that read lands", async () => {
    const readStarted = vi.fn();
    let readCount = 0;
    const readAfterHold = deferred<EpicMentionTicketsResponse>();
    // The host's index never catches up: every read still says To do.
    fixture.client.requestWithSignal.mockImplementation(() => {
      readStarted();
      readCount += 1;
      return readCount <= 2
        ? Promise.resolve({ entries: TICKETS })
        : readAfterHold.promise;
    });
    const initialRead = nextCallOf(readStarted);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = renderSurfaceWithQueryClient(
      { visible: true, focused: true },
      queryClient,
    );
    await act(async () => {
      await initialRead;
    });

    const box = await screen.findByRole("checkbox", {
      name: "Write the store",
    });
    const answer = deferred<unknown>();
    const writeStarted = vi.fn();
    fixture.client.request.mockImplementation(() => {
      writeStarted();
      return answer.promise;
    });
    const pendingWrite = nextCallOf(writeStarted);
    fireEvent.click(box);
    await pendingWrite;
    await waitForElementToBeRemoved(box);
    vi.useFakeTimers();
    const settleRead = nextCallOf(readStarted);
    const mutationSucceeded = vi.fn();
    const unsubscribeMutation = queryClient
      .getMutationCache()
      .subscribe((event) => {
        if (
          event.type === "updated" &&
          event.mutation.state.status === "success"
        ) {
          mutationSucceeded();
        }
      });
    const successEvent = nextCallOf(mutationSucceeded);
    await act(async () => {
      answer.resolve({ updated: true });
      await Promise.all([settleRead, successEvent]);
    });
    unsubscribeMutation();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    const rowState = () =>
      screen
        .getByRole("checkbox", { name: "Write the store" })
        .getAttribute("aria-checked");
    expect(rowState()).toBe("true");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_STATUS_HOLD_MS - 1);
    });
    expect(readCount).toBe(2);
    expect(rowState()).toBe("true");

    const holdEndRead = nextCallOf(readStarted);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await holdEndRead;
    });
    expect(readCount).toBe(3);
    expect(rowState()).toBe("true");

    const landed = nextTicketReadLanded(queryClient, HOST_A_TICKETS_KEY);
    await act(async () => {
      readAfterHold.resolve({ entries: TICKETS });
      await landed;
      // The query's notifications wait on a zero-delay timer.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rowState()).toBe("false");
    expect(fixture.client.request).toHaveBeenCalledTimes(1);
    rendered.unmount();
    queryClient.clear();
  });

  it("reads the tickets again at each hold's own window end", async () => {
    const reads: Array<{
      readonly resolve: (value: EpicMentionTicketsResponse) => void;
    }> = [];
    const readStarted = vi.fn();
    fixture.client.requestWithSignal.mockImplementation(() => {
      readStarted();
      if (reads.length === 0) {
        reads.push({ resolve: () => undefined });
        return Promise.resolve({ entries: TICKETS });
      }
      const answer = deferred<EpicMentionTicketsResponse>();
      reads.push(answer);
      return answer.promise;
    });
    const initialRead = nextCallOf(readStarted);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = renderSurfaceWithQueryClient(
      { visible: true, focused: true },
      queryClient,
    );
    await act(async () => {
      await initialRead;
    });
    await screen.findByRole("checkbox", { name: "Write the store" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    const rowState = (name: string) =>
      screen.getByRole("checkbox", { name }).getAttribute("aria-checked");

    // Two writes 10 s apart, as the in-Task status hook holds them; the
    // host's index never catches up.
    vi.useFakeTimers();
    act(() => {
      useTicketStatusHoldsStore
        .getState()
        .hold(ticketKey("task-a", "t-store"), 2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    act(() => {
      useTicketStatusHoldsStore
        .getState()
        .hold(ticketKey("task-a", "t-route"), 2);
    });
    expect(rowState("Write the store")).toBe("true");
    expect(rowState("Wire the route")).toBe("true");

    const firstEndRead = nextCallOf(readStarted);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_STATUS_HOLD_MS - 10_000);
      await firstEndRead;
    });
    const firstLanded = nextTicketReadLanded(queryClient, HOST_A_TICKETS_KEY);
    await act(async () => {
      reads[1]?.resolve({ entries: TICKETS });
      await firstLanded;
      // The query's notifications wait on a zero-delay timer.
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rowState("Write the store")).toBe("false");
    expect(rowState("Wire the route")).toBe("true");

    const secondEndRead = nextCallOf(readStarted);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      await secondEndRead;
    });
    const secondLanded = nextTicketReadLanded(queryClient, HOST_A_TICKETS_KEY);
    await act(async () => {
      reads[2]?.resolve({ entries: TICKETS });
      await secondLanded;
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(rowState("Wire the route")).not.toBe("true");
    expect(reads).toHaveLength(3);
    rendered.unmount();
    queryClient.clear();
  });

  it("keeps a hold over a read sent before its window ended, then reads again", async () => {
    const hostBReads: Array<{
      readonly resolve: (value: EpicMentionTicketsResponse) => void;
    }> = [];
    const hostAReadStarted = vi.fn();
    const hostBReadStarted = vi.fn();
    fixture.client.requestWithSignal.mockImplementation(() => {
      if (fixture.client.getActiveHostId() === "host-2") {
        hostBReadStarted();
        const answer = deferred<EpicMentionTicketsResponse>();
        hostBReads.push(answer);
        return answer.promise;
      }
      hostAReadStarted();
      return Promise.resolve({ entries: TICKETS });
    });
    const hostARead = nextCallOf(hostAReadStarted);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const rendered = renderSurfaceWithQueryClient(
      { visible: true, focused: true },
      queryClient,
    );
    await act(async () => {
      await hostARead;
    });
    await screen.findByRole("checkbox", { name: "Write the store" });
    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));

    vi.useFakeTimers();
    act(() => {
      useTicketStatusHoldsStore
        .getState()
        .hold(ticketKey("task-a", "t-store"), 2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TICKET_STATUS_HOLD_MS - 1_000);
    });

    // Host B has nothing cached, so its first read is still in flight when
    // the window ends; the pane's read at the window end joins it.
    fixture.setActiveHostId("host-2");
    const lateRead = nextCallOf(hostBReadStarted);
    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: true, focused: true }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    await act(async () => {
      await lateRead;
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(hostBReads).toHaveLength(1);

    const lateLanded = nextTicketReadLanded(queryClient, HOST_B_TICKETS_KEY);
    const readAgain = nextCallOf(hostBReadStarted);
    await act(async () => {
      hostBReads[0]?.resolve({ entries: TICKETS });
      await lateLanded;
      await vi.advanceTimersByTimeAsync(0);
      await readAgain;
    });
    expect(
      screen
        .getByRole("checkbox", { name: "Write the store" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(hostBReads).toHaveLength(2);

    const freshLanded = nextTicketReadLanded(queryClient, HOST_B_TICKETS_KEY);
    await act(async () => {
      hostBReads[1]?.resolve({ entries: TICKETS });
      await freshLanded;
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(
      screen
        .getByRole("checkbox", { name: "Write the store" })
        .getAttribute("aria-checked"),
    ).toBe("false");
    rendered.unmount();
    queryClient.clear();
  });

  it("uses the Task list title when available and the ticket title otherwise", async () => {
    const base = taskA();
    fixture.tasks.splice(0, fixture.tasks.length, {
      ...base,
      epic: {
        ...base.epic,
        light: base.epic?.light
          ? { ...base.epic.light, title: "Task list title" }
          : null,
      },
    });
    fixture.client.requestWithSignal.mockResolvedValue({
      entries: TICKETS.map((entry) =>
        entry.epicId === "task-a"
          ? { ...entry, epicTitle: "Host read title" }
          : entry,
      ),
    });

    renderSurface();

    expect(
      await screen.findByRole("region", { name: "Task list title" }),
    ).not.toBeNull();
    expect(
      await screen.findByRole("region", { name: "Task B" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("region", { name: "Host read title" }),
    ).toBeNull();
  });

  it("keeps a Done ticket out of Open when the host switches during its write", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData<TicketsRead>(HOST_B_TICKETS_KEY, {
      entries: TICKETS,
      requestedAt: 0,
    });
    const oldHostBRead = deferred<EpicMentionTicketsResponse>();
    const newHostBRead = deferred<EpicMentionTicketsResponse>();
    const hostBReadStarted = vi.fn();
    const hostAReadStarted = vi.fn();
    let hostBReadCount = 0;
    fixture.client.requestWithSignal.mockImplementation(() => {
      if (fixture.client.getActiveHostId() === "host-2") {
        hostBReadStarted();
        hostBReadCount += 1;
        return hostBReadCount === 1
          ? oldHostBRead.promise
          : newHostBRead.promise;
      }
      hostAReadStarted();
      return Promise.resolve({ entries: TICKETS });
    });
    const hostARead = nextCallOf(hostAReadStarted);
    const rendered = renderSurfaceWithQueryClient(
      { visible: true, focused: true },
      queryClient,
    );
    await act(async () => {
      await hostARead;
    });

    const box = await screen.findByRole("checkbox", {
      name: "Write the store",
    });
    const writeAnswer = deferred<unknown>();
    const writeStarted = vi.fn();
    fixture.client.request.mockImplementation(() => {
      writeStarted();
      return writeAnswer.promise;
    });
    const writeCall = nextCallOf(writeStarted);
    fireEvent.click(box);
    await writeCall;
    await waitForElementToBeRemoved(box);

    fixture.setActiveHostId("host-2");
    const oldReadCall = nextCallOf(hostBReadStarted);
    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: true, focused: false }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    await act(async () => {
      await oldReadCall;
    });

    const refetchCall = nextCallOf(hostBReadStarted);
    await act(async () => {
      writeAnswer.resolve({ updated: true });
      await refetchCall;
    });
    await act(async () => {
      oldHostBRead.resolve({ entries: TICKETS });
      await oldHostBRead.promise;
    });

    fireEvent.mouseDown(screen.getByRole("tab", { name: "All" }));
    const checked = screen.getByRole("checkbox", { name: "Write the store" });
    expect(checked.getAttribute("aria-checked")).toBe("true");
    expect(checked.matches(":disabled")).toBe(false);
    expect(fixture.client.request).toHaveBeenCalledTimes(1);
    expect(
      queryClient
        .getQueryData<TicketsRead>(HOST_B_TICKETS_KEY)
        ?.entries.find((entry) => entry.artifactId === "t-store")?.status,
    ).toBe(0);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Open" }));
    expect(
      screen.queryByRole("checkbox", { name: "Write the store" }),
    ).toBeNull();
    expect(fixture.client.request).toHaveBeenCalledTimes(1);

    rendered.unmount();
    newHostBRead.resolve({ entries: TICKETS });
    queryClient.clear();
  });

  it("shows only the Tasks linked to the picked repo", async () => {
    renderSurface();
    await screen.findByRole("region", { name: "Task B" });

    fireEvent.keyDown(screen.getByRole("combobox", { name: "Repo" }), {
      key: "ArrowDown",
    });
    const option = screen.getByRole("option", { name: "acme/web" });
    fireEvent.focus(option);
    fireEvent.keyDown(option, { key: "Enter" });

    expect(screen.queryByRole("region", { name: "Task B" })).toBeNull();
    expect(section("Task A")).not.toBeNull();
  });

  it("opens a ticket in its Task", async () => {
    renderSurface();

    fireEvent.click(
      await screen.findByRole("button", { name: "Write the store" }),
    );

    expect(fixture.navigations).toHaveLength(1);
    expect(fixture.navigations[0]).toMatchObject({
      to: "/epics/$epicId/$tabId",
      params: { epicId: "task-a" },
      search: { focusArtifactId: "t-store" },
    });
  });
});
