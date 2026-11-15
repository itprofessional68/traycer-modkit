import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  waitForElementToBeRemoved,
  within,
} from "@testing-library/react";
import type { NavigateOptions } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  EpicMentionTicketSuggestion,
  ListTaskLight,
} from "@traycer/protocol/host/epic/unary-schemas";
import { WithTestQueryClient } from "@/__tests__/with-test-query-client";
import { TabSurfaceActivityContext } from "@/components/layout/tab-surface-activity-context";
import { TodosSurface } from "@/components/todos/todos-surface";
import { taskLight } from "@/lib/view-replica/__tests__/replica-fixtures";
import { __resetTabNavigationControllerForTesting } from "@/lib/tab-navigation";
import { resetTabsStoreForTest } from "@/stores/tabs/test-support/tabs-store-fixtures";

const fixture = vi.hoisted(() => {
  const client = {
    getActiveHostId: () => "host-1",
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

/** Task A is linked to acme/web; Task B is not on the Task list's page. */
function taskA(): ListTaskLight {
  const base = taskLight("task-a", null);
  return {
    ...base,
    epic: {
      light: base.epic?.light ?? null,
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
  fixture.client.requestWithSignal.mockResolvedValue({ entries: TICKETS });
  return render(<TodosSurface />, { wrapper: WithTestQueryClient });
}

function section(name: string): HTMLElement {
  return screen.getByRole("region", { name });
}

describe("TodosSurface", () => {
  beforeEach(() => {
    resetTabsStoreForTest();
    __resetTabNavigationControllerForTesting();
    fixture.tasks.splice(0, fixture.tasks.length, taskA());
  });

  afterEach(() => {
    cleanup();
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
    fireEvent.click(done);
    await waitFor(() => {
      expect(fixture.client.request).toHaveBeenCalledWith(
        "epic.updateArtifactStatus",
        {
          epicId: "task-a",
          artifactId: "t-ship",
          artifactType: "ticket",
          status: 0,
        },
      );
    });

    const inProgress = screen.getByRole("checkbox", { name: "Wire the route" });
    fireEvent.click(inProgress);
    await waitFor(() => {
      expect(fixture.client.request).toHaveBeenCalledWith(
        "epic.updateArtifactStatus",
        {
          epicId: "task-a",
          artifactId: "t-route",
          artifactType: "ticket",
          status: 2,
        },
      );
    });
  });

  it("reads tickets when visible and does not read while hidden", async () => {
    fixture.client.requestWithSignal.mockResolvedValue({ entries: TICKETS });
    const rendered = render(
      <TabSurfaceActivityContext.Provider
        value={{ visible: true, focused: true }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
      { wrapper: WithTestQueryClient },
    );

    await waitFor(() => {
      expect(fixture.client.requestWithSignal).toHaveBeenCalledTimes(1);
    });

    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: false, focused: false }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    expect(fixture.client.requestWithSignal).toHaveBeenCalledTimes(1);

    rendered.rerender(
      <TabSurfaceActivityContext.Provider
        value={{ visible: true, focused: true }}
      >
        <TodosSurface />
      </TabSurfaceActivityContext.Provider>,
    );
    await waitFor(() => {
      expect(fixture.client.requestWithSignal).toHaveBeenCalledTimes(2);
    });
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
