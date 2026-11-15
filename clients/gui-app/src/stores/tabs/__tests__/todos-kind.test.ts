import type { UseNavigateResult } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dispatchAction,
  type KeybindingRouter,
} from "@/lib/keybindings/dispatch";
import { getDefaultBindings } from "@/lib/keybindings/actions";
import {
  __resetTabNavigationControllerForTesting,
  activateTabIntent,
  todosTabIntent,
} from "@/lib/tab-navigation";
import { flattenLayoutRefs } from "@/stores/tabs/layout";
import { migrateTabsPersistedState, useTabsStore } from "@/stores/tabs/store";
import { resetTabsStoreForTest } from "@/stores/tabs/test-support/tabs-store-fixtures";

const TODOS_RECORD = {
  id: "todos",
  kind: "todos",
  name: "To-dos",
  lastPath: "/todos",
} as const;

function savedLayout(todos: unknown) {
  return {
    version: 2,
    items: [
      { kind: "tab", id: "tab:todos", ref: { kind: "todos", id: "todos" } },
    ],
    activeItemId: "tab:todos",
    systemTabs: { history: null, settings: null, todos },
  };
}

describe("the To-dos tab", () => {
  beforeEach(() => {
    resetTabsStoreForTest();
    __resetTabNavigationControllerForTesting();
  });

  afterEach(() => {
    __resetTabNavigationControllerForTesting();
  });

  it("opens as its own tab at /todos", () => {
    const destinations: unknown[] = [];
    const navigate: UseNavigateResult<string> = (options) => {
      destinations.push(options.to);
      return Promise.resolve();
    };

    activateTabIntent(navigate, todosTabIntent(), undefined);

    const state = useTabsStore.getState();
    expect(state.systemTabs.todos).toEqual(TODOS_RECORD);
    expect(flattenLayoutRefs(state)).toContainEqual({
      kind: "todos",
      id: "todos",
    });
    expect(destinations).toEqual(["/todos"]);
  });

  it("comes back with a saved layout that has it", () => {
    const restored = migrateTabsPersistedState(savedLayout(TODOS_RECORD));

    expect(restored.systemTabs.todos).toEqual(TODOS_RECORD);
    expect(flattenLayoutRefs(restored)).toEqual([
      { kind: "todos", id: "todos" },
    ]);
  });

  it("is absent, not broken, in a layout saved before it existed", () => {
    const restored = migrateTabsPersistedState({
      ...savedLayout(undefined),
      systemTabs: { history: null, settings: null },
    });

    expect(restored.systemTabs.todos).toBeNull();
    expect(flattenLayoutRefs(restored)).toEqual([]);
  });

  it("drops a saved record that points somewhere else", () => {
    const restored = migrateTabsPersistedState(
      savedLayout({ ...TODOS_RECORD, lastPath: "/settings/general" }),
    );

    expect(restored.systemTabs.todos).toBeNull();
  });
});

describe("app.todos.open", () => {
  it("has no shortcut until one is bound, and opens To-dos when run", () => {
    const navigateToTodos = vi.fn();
    const router: KeybindingRouter = {
      getPathname: () => "/",
      navigateHome: () => undefined,
      navigateSettings: () => undefined,
      navigateToEpic: () => undefined,
      navigateToEpicTab: () => undefined,
      navigateToEpicList: () => undefined,
      navigateToTodos,
      navigateSettingsSection: () => undefined,
      navigateToTabIntent: () => undefined,
      goBack: () => undefined,
      goForward: () => undefined,
      isHistoryNavAvailable: () => false,
      canGoBack: () => false,
      canGoForward: () => false,
    };

    expect(getDefaultBindings()["app.todos.open"]).toBeNull();
    expect(dispatchAction("app.todos.open", router)).toBe(true);
    expect(navigateToTodos).toHaveBeenCalledOnce();
  });
});
