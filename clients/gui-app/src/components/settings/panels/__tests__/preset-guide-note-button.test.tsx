import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import type { WorkspaceReadFileResponse } from "@traycer/protocol/host/workspace/unary-schemas";
import { nextCallOf } from "@/__tests__/next-call";
import { PresetGuideNoteButton } from "@/components/settings/panels/preset-guide-note-button";
import type { HostRpcRegistry } from "@/lib/host";

const hoisted = vi.hoisted(() => ({
  toastSuccess: vi.fn<(message: string) => void>(),
  toastInfo: vi.fn<(message: string) => void>(),
  toastFromHostError: vi.fn<(error: unknown, fallback: string) => void>(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: hoisted.toastSuccess,
    info: hoisted.toastInfo,
    warning: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock("@/lib/host-error-toast", () => ({
  toastFromHostError: hoisted.toastFromHostError,
}));

const GUIDE_READ: WorkspaceReadFileResponse = {
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
    hoisted.toastInfo.mockReset();
    hoisted.toastFromHostError.mockReset();
  });

  it("says the note was added even when the row is gone by then", async () => {
    const read = deferred<typeof GUIDE_READ>();
    const request = vi
      .fn()
      .mockReturnValueOnce(read.promise)
      .mockResolvedValueOnce({ status: "saved" });
    const { removeRow } = renderRow(request);
    const added = nextCallOf(hoisted.toastSuccess);

    fireEvent.click(screen.getByTestId("agent-preset-add-to-guide"));
    removeRow();
    await act(async () => {
      read.resolve(GUIDE_READ);
      await read.promise;
    });

    expect(await added).toEqual([
      "Added to the project's agent selection guide.",
    ]);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("reports a failure even when the row is gone by then", async () => {
    const read = deferred<typeof GUIDE_READ>();
    const request = vi.fn().mockReturnValueOnce(read.promise);
    const { removeRow } = renderRow(request);
    const failed = nextCallOf(hoisted.toastFromHostError);

    fireEvent.click(screen.getByTestId("agent-preset-add-to-guide"));
    removeRow();
    await act(async () => {
      read.reject(new Error("host went away"));
      await read.promise.catch(() => undefined);
    });

    const [, fallback] = await failed;
    expect(fallback).toBe("Couldn't add the note to the guide.");
    expect(hoisted.toastSuccess).not.toHaveBeenCalled();
  });

  it("copies the note when the guide can't be opened, even when the row is gone by then", async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    onTestFinished(() => {
      if (original === undefined)
        Reflect.deleteProperty(navigator, "clipboard");
      else Object.defineProperty(navigator, "clipboard", original);
    });
    const read = deferred<typeof GUIDE_READ>();
    const request = vi.fn().mockReturnValueOnce(read.promise);
    const { removeRow } = renderRow(request);
    const copied = nextCallOf(hoisted.toastInfo);

    fireEvent.click(screen.getByTestId("agent-preset-add-to-guide"));
    removeRow();
    await act(async () => {
      read.resolve({ ...GUIDE_READ, content: null, error: "ENOENT" });
      await read.promise;
    });

    expect(await copied).toEqual([
      "Couldn't open this project's agent selection guide, so the note was copied.",
    ]);
    expect(writeText).toHaveBeenCalledWith("Prefer Opus here.");
    expect(request).toHaveBeenCalledTimes(1);
  });
});
