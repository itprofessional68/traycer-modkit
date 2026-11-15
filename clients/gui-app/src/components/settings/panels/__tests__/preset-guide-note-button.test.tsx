import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import { PresetGuideNoteButton } from "@/components/settings/panels/preset-guide-note-button";
import type { HostRpcRegistry } from "@/lib/host";

const hoisted = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastFromHostError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: hoisted.toastSuccess,
    info: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/host-error-toast", () => ({
  toastFromHostError: hoisted.toastFromHostError,
}));

const GUIDE_READ = {
  workspacePath: "/work/app",
  filePath: ".traycer/agent-selection-guide.md",
  content: "# Guide\n",
  truncated: false,
  error: null,
};

/**
 * The button on its own row, which the test can take away while the host has
 * not answered - as deleting the preset or choosing another machine does.
 */
function renderRow(request: HostClient<HostRpcRegistry>["request"]) {
  const queryClient = new QueryClient();
  const row = (shown: boolean) => (
    <QueryClientProvider client={queryClient}>
      {shown ? (
        <PresetGuideNoteButton
          client={{ request }}
          repoPath="/work/app"
          note="Prefer Opus here."
        />
      ) : null}
    </QueryClientProvider>
  );
  const view = render(row(true));
  return { removeRow: () => view.rerender(row(false)) };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("<PresetGuideNoteButton />", () => {
  afterEach(() => {
    cleanup();
    hoisted.toastSuccess.mockReset();
    hoisted.toastFromHostError.mockReset();
  });

  it("says the note was added even when the row is gone by then", async () => {
    const read = deferred<typeof GUIDE_READ>();
    const request = vi
      .fn()
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce({ status: "saved" });
    const { removeRow } = renderRow(request);

    fireEvent.click(screen.getByTestId("agent-preset-add-to-guide"));
    removeRow();
    await act(async () => {
      read.resolve(GUIDE_READ);
      await read.promise;
    });

    await vi.waitFor(() => {
      expect(hoisted.toastSuccess).toHaveBeenCalledWith(
        "Added to the project's agent selection guide.",
      );
    });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reports a failure even when the row is gone by then", async () => {
    const read = deferred<typeof GUIDE_READ>();
    const request = vi.fn().mockReturnValueOnce(read.promise);
    const { removeRow } = renderRow(request);

    fireEvent.click(screen.getByTestId("agent-preset-add-to-guide"));
    removeRow();
    await act(async () => {
      read.reject(new Error("host went away"));
      await read.promise.catch(() => undefined);
    });

    await vi.waitFor(() => {
      expect(hoisted.toastFromHostError).toHaveBeenCalledWith(
        expect.anything(),
        "Couldn't add the note to the guide.",
      );
    });
    expect(hoisted.toastSuccess).not.toHaveBeenCalled();
  });
});
