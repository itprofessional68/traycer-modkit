import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRunSettings } from "@traycer/protocol/persistence/epic/schemas";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { nextCallOf } from "@/__tests__/next-call";
import { ChatPresetTabMenu } from "@/components/epic-canvas/canvas/chat-preset-menu";
import { openChatTabSession } from "@/components/epic-canvas/canvas/__tests__/chat-tab-menu-session";
import { getChatSessionRegistry } from "@/lib/registries/chat-session-registry";
import {
  useAgentPresetsStore,
  type AgentPresetDraft,
} from "@/stores/agents/agent-presets-store";

const hoisted = vi.hoisted(() => {
  const request =
    vi.fn<(method: string, params: unknown) => Promise<unknown>>();
  return {
    request,
    // The host's request boundary is the one seam faked: the configure hook,
    // its error toast and TanStack's mutation all run as they do in the app.
    hostClient: { getActiveHostId: () => "host-1", request },
    toastSuccess: vi.fn<(message: string) => void>(),
    toastFromHostError: vi.fn<(error: unknown, fallback: string) => void>(),
    schemaVersion: { major: 7, minor: 1 },
  };
});

vi.mock("@/hooks/host/use-host-client-for-host-id", () => ({
  useHostClientForHostId: () => hoisted.hostClient,
}));
vi.mock("@/hooks/host/use-host-supports-method", () => ({
  useHostMethodSchemaVersion: () => hoisted.schemaVersion,
}));
vi.mock("sonner", () => ({ toast: { success: hoisted.toastSuccess } }));
vi.mock("@/lib/host-error-toast", () => ({
  toastFromHostError: hoisted.toastFromHostError,
}));

const SETTINGS: ChatRunSettings = {
  ultracode: false,
  harnessId: "codex",
  model: "gpt-5-codex",
  permissionMode: "full_access",
  reasoningEffort: null,
  serviceTier: null,
  agentMode: "regular",
  profileId: null,
};

const PRESET: AgentPresetDraft = {
  id: "preset-1",
  name: "Careful Claude",
  repoPath: "/work/app",
  harnessId: "claude",
  model: "sonnet",
  reasoningEffort: "high",
  serviceTier: null,
  permissionMode: "supervised",
  profileId: "work",
  guideNote: null,
  isDefault: false,
};

function openMenu(): void {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ContextMenu>
        <ContextMenuTrigger>
          <span data-testid="tab">tab</span>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ChatPresetTabMenu epicId="epic-1" chatId="chat-1" hostId="host-1" />
        </ContextMenuContent>
      </ContextMenu>
    </QueryClientProvider>,
  );
  fireEvent.contextMenu(screen.getByTestId("tab"));
}

async function openPresets(): Promise<void> {
  fireEvent.keyDown(await screen.findByText("Apply preset"), {
    key: "ArrowRight",
  });
}

describe("Apply preset on a chat tab", () => {
  beforeEach(() => {
    useAgentPresetsStore.getState().resetForTests();
    useAgentPresetsStore.getState().savePreset("host-1", PRESET);
  });

  afterEach(() => {
    cleanup();
    hoisted.request.mockReset();
    hoisted.toastSuccess.mockReset();
    hoisted.toastFromHostError.mockReset();
    hoisted.schemaVersion = { major: 7, minor: 1 };
    getChatSessionRegistry().disposeAll();
  });

  it("moves the chat onto the preset, keeping its routing, and says so once it lands", async () => {
    hoisted.request.mockResolvedValue({});
    const applied = nextCallOf(hoisted.toastSuccess);
    openChatTabSession("owner", SETTINGS);
    openMenu();
    await openPresets();
    fireEvent.click(await screen.findByText("Careful Claude"));

    expect(await applied).toEqual(["Applied Careful Claude."]);
    expect(hoisted.request).toHaveBeenCalledWith("agent.configure", {
      epicId: "epic-1",
      senderAgentId: "chat-1",
      agentId: "chat-1",
      harnessId: "claude",
      model: "sonnet",
      profileSelection: { kind: "profile", profileId: "work" },
      reasoningEffort: "high",
      fastMode: false,
      serviceTier: null,
      permissionMode: "supervised",
      routing: null,
    });
  });

  it("reports a refusal once the menu is gone, and claims nothing applied", async () => {
    hoisted.request.mockRejectedValue(new Error("not your agent"));
    const refused = nextCallOf(hoisted.toastFromHostError);
    openChatTabSession("owner", SETTINGS);
    openMenu();
    await openPresets();
    fireEvent.click(await screen.findByText("Careful Claude"));

    const [, fallback] = await refused;
    expect(fallback).toBe("Couldn't apply the preset to this agent.");
    expect(hoisted.toastSuccess).not.toHaveBeenCalled();
  });

  it("is not offered when the host has no presets", () => {
    useAgentPresetsStore.getState().resetForTests();
    openChatTabSession("owner", SETTINGS);
    openMenu();

    expect(screen.queryByText("Apply preset")).toBeNull();
  });

  it("holds back a Fast preset until the host can carry its tier", async () => {
    useAgentPresetsStore
      .getState()
      .savePreset("host-1", { ...PRESET, serviceTier: "priority" });
    openChatTabSession("owner", SETTINGS);
    openMenu();
    await openPresets();

    const item = await screen.findByText("Careful Claude");
    expect(item.closest("[data-disabled]")).not.toBeNull();
  });

  it("cannot be used on a chat shared with the person as a viewer", async () => {
    openChatTabSession("viewer", SETTINGS);
    openMenu();

    const trigger = await screen.findByText("Apply preset");
    expect(trigger.closest("[data-disabled]")).not.toBeNull();
  });
});
