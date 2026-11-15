import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { AppRouterProvider } from "@/app-router-provider";
import { createAppRouter, type AppRouter } from "@/router";
import { TraycerAppRuntimeSurface } from "@/traycer-app";

// The runtime surface mounts its bridges beside the router. They are not what
// this test pins, so each renders nothing.
vi.mock("@/components/layout/bridges/runner-host-bridges", () => ({
  RunnerHostBridges: () => null,
}));
vi.mock("@/components/layout/bridges/host-controller-status-listener", () => ({
  HostControllerStatusListener: () => null,
}));
vi.mock("@/components/layout/bridges/app-update-toast-controller", () => ({
  AppUpdateToastController: () => null,
}));
vi.mock(
  "@/components/layout/bridges/login-import-announcement-controller",
  () => ({ LoginImportAnnouncementController: () => null }),
);
vi.mock(
  "@/components/layout/bridges/session-import-announcement-controller",
  () => ({ SessionImportAnnouncementController: () => null }),
);
vi.mock("@/components/share-on-x/share-on-x-controller", () => ({
  ShareOnXController: () => null,
}));
vi.mock("@/components/layout/bridges/link-login-deep-link-bridge", () => ({
  LinkLoginDeepLinkBridge: () => null,
}));
vi.mock(
  "@/components/layout/bridges/worktree-delete-progress-toast-bridge",
  () => ({ WorktreeDeleteProgressToastBridge: () => null }),
);
vi.mock(
  "@/components/layout/bridges/session-import-progress-toast-bridge",
  () => ({ SessionImportProgressToastBridge: () => null }),
);
vi.mock("@/providers/harness-catalog-prefetcher", () => ({
  HarnessCatalogPrefetcher: () => null,
}));
vi.mock("@/providers/rate-limit-poll-provider", () => ({
  RateLimitPollProvider: () => null,
}));
vi.mock("@/providers/history-prune-provider", () => ({
  HistoryPruneProvider: () => null,
}));
vi.mock("@/components/chat/chat-usage-dialog", () => ({
  ChatUsageDialog: () => null,
}));

/**
 * Records every subscription to `router`'s history in order, and the ones
 * still live, so a test can read both the order and any stacking.
 */
function recordSubscriptions(router: AppRouter): {
  readonly subscribed: unknown[];
  readonly live: Set<object>;
} {
  const subscribed: unknown[] = [];
  const live = new Set<object>();
  const subscribe = router.history.subscribe.bind(router.history);
  router.history.subscribe = (listener) => {
    const token = {};
    subscribed.push(listener);
    live.add(token);
    const unsubscribe = subscribe(listener);
    return () => {
      live.delete(token);
      unsubscribe();
    };
  };
  return { subscribed, live };
}

describe("traversal observers versus the router's load", () => {
  afterEach(() => {
    cleanup();
  });

  it("subscribes both observers before the load subscribes to the history", () => {
    const router = createAppRouter("/epics/epic-order", null);
    const { subscribed } = recordSubscriptions(router);

    render(<AppRouterProvider router={router} />);

    expect(subscribed.indexOf(router.load)).toBe(2);
  });

  it("keeps one subscription per observer and one for the load under StrictMode, and releases all on unmount", () => {
    const router = createAppRouter("/epics/epic-strict", null);
    const { live } = recordSubscriptions(router);

    const { unmount } = render(
      <StrictMode>
        <AppRouterProvider router={router} />
      </StrictMode>,
    );

    expect(live.size).toBe(3);
    unmount();
    expect(live.size).toBe(0);
  });

  it("wires the observers through the runtime surface the app renders", () => {
    const router = createAppRouter("/epics/epic-surface", null);
    const { subscribed } = recordSubscriptions(router);

    render(<TraycerAppRuntimeSurface router={router} />);

    expect(subscribed.indexOf(router.load)).toBe(2);
  });
});
