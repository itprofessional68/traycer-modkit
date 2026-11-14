import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatRunSettings } from "@traycer/protocol/persistence/epic/schemas";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ChatPresetTabMenu } from "@/components/epic-canvas/canvas/chat-preset-menu";
import { openChatTabSession } from "@/components/epic-canvas/canvas/__tests__/chat-tab-menu-session";
import { getChatSessionRegistry } from "@/lib/registries/chat-session-registry";
import {
  useAgentPresetsStore,
  type AgentPresetDraft,
} from "@/stores/agents/agent-presets-store";

const hoisted = vi.hoisted(() => ({
  mutate: vi.fn(),
  schemaVersion: { major: 7, minor: 1 },
}));

vi.mock("@/hooks/host/use-host-client-for-host-id", () => ({
  useHostClientForHostId: () => null,
}));
vi.mock("@/hooks/host/use-host-supports-method", () => ({
  useHostMethodSchemaVersion: () => hoisted.schemaVersion,
}));
vi.mock("@/hooks/agent/use-configure-agent-mutation", () => ({
  useAgentConfigure: () => ({ mutate: hoisted.mutate, isPending: false }),
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
    <ContextMenu>
      <ContextMenuTrigger>
        <span data-testid="tab">tab</span>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ChatPresetTabMenu epicId="epic-1" chatId="chat-1" hostId="host-1" />
      </ContextMenuContent>
    </ContextMenu>,
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
    hoisted.mutate.mockReset();
    hoisted.schemaVersion = { major: 7, minor: 1 };
    getChatSessionRegistry().disposeAll();
  });

  it("moves the chat onto the preset, keeping its routing", async () => {
    openChatTabSession("owner", SETTINGS);
    openMenu();
    await openPresets();
    fireEvent.click(await screen.findByText("Careful Claude"));

    expect(hoisted.mutate).toHaveBeenCalledWith(
      {
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
      },
      expect.anything(),
    );
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
