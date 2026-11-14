import "../../../../../__tests__/test-browser-apis";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { EditorView } from "@uiw/react-codemirror";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import type { WorkspaceFileRef } from "@/stores/epics/canvas/types";
import { fileEditRuntimeRegistry } from "@/lib/workspace/file-edit-runtime-registry";
import { fileContentRevision } from "@/lib/workspace/file-content-revision";

interface MarkdownEditTestState {
  supportsWrite: boolean;
  readContent: string;
  readonly writeFile: Mock;
}

const state = vi.hoisted((): MarkdownEditTestState => ({
  supportsWrite: true,
  readContent: "",
  writeFile: vi.fn(),
}));

vi.mock("@/hooks/agent/use-host-reachability", () => ({
  useHostReachability: () => ({ status: "reachable", hostLabel: "Host A" }),
}));

vi.mock("@/hooks/host/use-tab-host-client", () => ({
  useTabHostClient: () => null,
}));

vi.mock("@/hooks/host/use-host-supports-method", () => ({
  useHostMethodSchemaVersion: () => null,
  useHostSupportsMethod: () => state.supportsWrite,
}));

vi.mock("@/hooks/workspace/use-read-file-query", () => ({
  useWorkspaceReadFile: () => ({
    data: { content: state.readContent, error: null, truncated: false },
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/workspace/use-workspace-write-file-mutation", () => ({
  useWorkspaceWriteFile: () => ({ mutateAsync: state.writeFile }),
}));

vi.mock(
  "@/components/epic-canvas/workspace-file/workspace-file-renderer",
  () => ({
    WorkspaceFileRenderer: () => <div data-testid="diffs-source-view" />,
  }),
);

import { WorkspaceFileTile } from "../workspace-file-tile";
import { TabHostProvider } from "../../tab-host-provider";

const NODE: WorkspaceFileRef = {
  id: "workspace-file:host-A:/work/repo:README.md",
  instanceId: "workspace-file-instance",
  type: "workspace-file",
  name: "README.md",
  hostId: "host-A",
  workspacePath: "/work/repo",
  filePath: "README.md",
};

const SURFACE_ID = `view-1:workspace-file:${NODE.instanceId}`;

describe("<WorkspaceFileTile /> markdown edit mode", () => {
  beforeEach(() => {
    fileEditRuntimeRegistry.resetForTesting();
    state.supportsWrite = true;
    state.readContent = "# Notes\r\n\r\nship it\r\n";
    state.writeFile.mockReset();
    state.writeFile.mockResolvedValue({
      workspacePath: "/work/repo",
      filePath: "README.md",
      status: "saved",
      revision: "saved-revision",
    });
  });

  afterEach(() => {
    cleanup();
    fileEditRuntimeRegistry.resetForTesting();
  });

  it("saves toolbar edits with the file's own line endings", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const view = await editableView();

    // Select "ship" on the third line.
    const line = view.state.doc.line(3);
    act(() => {
      view.dispatch({ selection: { anchor: line.from, head: line.from + 4 } });
    });
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    fireEvent.blur(view.contentDOM);

    const expectedRevision = await fileContentRevision(state.readContent);
    await waitFor(() => {
      expect(state.writeFile).toHaveBeenCalledWith({
        workspacePath: "/work/repo",
        filePath: "README.md",
        expectedRevision,
        content: "# Notes\r\n\r\n**ship** it\r\n",
      });
    });
  });

  it("gives pasted lines the file's own line endings", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const view = await editableView();

    act(() => {
      view.dispatch({ selection: { anchor: view.state.doc.length } });
    });
    const paste = new Event("paste", { bubbles: true, cancelable: true });
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: () => "one\ntwo\n" },
    });
    act(() => {
      view.contentDOM.dispatchEvent(paste);
    });
    fireEvent.blur(view.contentDOM);

    await waitFor(() => {
      expect(state.writeFile).toHaveBeenCalledWith(
        expect.objectContaining({
          content: "# Notes\r\n\r\nship it\r\none\r\ntwo\r\n",
        }),
      );
    });
  });

  it("renders the edited markdown beside the source", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await editableView();

    const preview = screen.getByTestId("markdown-split-preview");
    expect(preview.querySelector("h1")?.textContent).toBe("Notes");
  });

  it("hands the file back when leaving edit mode", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await editableView();
    expect(ownerSurfaceId()).toBe(SURFACE_ID);

    fireEvent.click(screen.getByRole("button", { name: "Preview" }));

    expect(ownerSurfaceId()).toBeNull();
    expect(screen.queryByTestId("markdown-source-editor")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Preview" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("stays in edit mode when the draft grows past the preview limit", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const view = await editableView();

    act(() => {
      view.dispatch({
        changes: { from: view.state.doc.length, insert: "x".repeat(100_001) },
      });
    });

    expect(screen.getByTestId("markdown-source-editor")).toBeTruthy();
    const edit = screen.getByRole("button", { name: "Edit" });
    expect(edit.getAttribute("aria-pressed")).toBe("true");
    expect(edit.hasAttribute("disabled")).toBe(false);
  });

  it("stays read-only and says why while another view edits the file", async () => {
    renderTile();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await editableView();
    const runtime = fileEditRuntimeRegistry.get({
      userId: null,
      hostId: "host-A",
      workspacePath: "/work/repo",
      filePath: "README.md",
    });
    if (runtime === null) throw new Error("runtime not attached");

    act(() => {
      runtime.releaseOwnership(SURFACE_ID);
      runtime.store.setState({ ownerSurfaceId: "other-view" });
    });

    expect(
      await screen.findByText(/This file is being edited in another view/),
    ).toBeTruthy();
    expect(
      screen
        .getByTestId("markdown-source-editor")
        .querySelector(".cm-content")
        ?.getAttribute("contenteditable"),
    ).toBe("false");
  });

  it("offers no edit mode when the host cannot save files", () => {
    state.supportsWrite = false;
    renderTile();

    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});

async function editableView(): Promise<EditorView> {
  const host = await screen.findByTestId("markdown-source-editor");
  return waitFor(() => {
    const content = host.querySelector<HTMLElement>(".cm-content");
    if (content?.getAttribute("contenteditable") !== "true") {
      throw new Error("editor is not editable yet");
    }
    const view = EditorView.findFromDOM(content);
    if (view === null) throw new Error("editor view not found");
    return view;
  });
}

function ownerSurfaceId(): string | null {
  return (
    fileEditRuntimeRegistry
      .get({
        userId: null,
        hostId: "host-A",
        workspacePath: "/work/repo",
        filePath: "README.md",
      })
      ?.store.getState().ownerSurfaceId ?? null
  );
}

function renderTile(): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <TabHostProvider hostId="host-A">
        <WorkspaceFileTile node={NODE} viewTabId="view-1" isActive />
      </TabHostProvider>
    </QueryClientProvider>,
  );
}
