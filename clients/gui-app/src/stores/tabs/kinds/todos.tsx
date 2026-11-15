import { createElement, lazy } from "react";
import { ListChecks } from "lucide-react";
import { useLandingDraftStore } from "@/stores/home/landing-draft-store";
import { todosTabIntent } from "@/lib/tab-navigation/intents";
import type { SystemTab, TabKindModule } from "@/stores/tabs/types";
import { TAB_KIND_SPLIT_ELIGIBILITY } from "@/stores/tabs/tab-kind-policy";

const TODOS_TAB_LABEL = "To-dos";
const TODOS_PATH = "/todos";

const todosSurface = lazy(() =>
  import("@/components/todos/todos-surface").then((module) => ({
    default: module.TodosSurface,
  })),
);

/**
 * Module for `kind: "todos"` tabs: the tickets of every Task, to check off.
 * One per window, like History, and read through the app-wide host.
 */
export const todosTabModule: TabKindModule<"todos", SystemTab> = {
  kind: "todos",
  build: (source) => ({
    kind: "todos",
    id: "todos",
    route: TODOS_PATH,
    name: source.name.length > 0 ? source.name : TODOS_TAB_LABEL,
    icon: ListChecks,
    canDuplicate: false,
    canOpenInNewWindow: true,
    lastPath: source.lastPath,
  }),
  descriptor: {
    kind: "todos",
    surface: {
      render: () => createElement(todosSurface),
      canonicalRoute: (tab) => tab.route,
      splitEligibility: TAB_KIND_SPLIT_ELIGIBILITY.todos,
      duplication: "forbidden",
      singleton: "per-window",
      newWindow: "copy",
      readinessScope: "default-host",
      durableState: { owner: "tabs-store", eviction: "reconstruct" },
    },
    duplicate: () => null,
    resolveIntent: () => todosTabIntent(),
    routeOptions: () => ({ to: TODOS_PATH }),
    activate: () => {
      useLandingDraftStore.getState().clearActiveDraft();
    },
    requestClose: (_tab, close) => {
      close({ kind: "todos", id: "todos" });
    },
    requiresCloseConfirm: () => false,
    openInNewWindow: (tab, deps) => {
      void deps.bridge.requestNew(tab.route);
    },
    matchesPath: (_tab, pathname) => isTodosPath(pathname),
  },
};

export function defaultTodosTabName(): string {
  return TODOS_TAB_LABEL;
}

export function todosPath(): string {
  return TODOS_PATH;
}

export function isTodosPath(pathname: string): boolean {
  return pathname === TODOS_PATH || pathname === `${TODOS_PATH}/`;
}
