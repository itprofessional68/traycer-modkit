import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ComposerPresetsMenu } from "@/components/home/toolbar/composer-presets-menu";
import { useAgentPresetsStore } from "@/stores/agents/agent-presets-store";
import {
  createComposerToolbarStore,
  type ComposerToolbarStore,
} from "@/stores/composer/composer-toolbar-store";

const HOST = "host-a";

function toolbarStore(hostId: string | null): ComposerToolbarStore {
  return createComposerToolbarStore({
    purpose: "run",
    reasoningFallback: "model-default",
    seedKey: "presets-menu",
    values: {
      permission: "full_access",
      selection: { harnessId: "codex", modelSlug: "gpt", profileId: null },
      reasoning: "",
      serviceTier: "",
      ultracode: false,
    },
    onSettingsChange: null,
    tuiOnly: false,
    chatLineCarriesAutoMode: null,
    ultracodeCarried: false,
    hostId,
  });
}

describe("<ComposerPresetsMenu />", () => {
  beforeEach(() => {
    useAgentPresetsStore.getState().resetForTests();
    useAgentPresetsStore.getState().savePreset(HOST, {
      id: "preset-1",
      name: "Careful Claude",
      repoPath: "/work/app",
      harnessId: "claude",
      model: "sonnet",
      reasoningEffort: "high",
      serviceTier: null,
      permissionMode: "supervised",
      profileId: null,
      isDefault: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows nothing for a host with no presets", () => {
    render(
      <ComposerPresetsMenu store={toolbarStore("host-b")} disabled={false} />,
    );
    expect(screen.queryByTestId("composer-presets-trigger")).toBeNull();
  });

  it("sets the composer to the preset picked, under its project", async () => {
    const store = toolbarStore(HOST);
    render(<ComposerPresetsMenu store={store} disabled={false} />);

    await userEvent.click(screen.getByTestId("composer-presets-trigger"));
    expect(screen.getByText("app")).toBeTruthy();
    await userEvent.click(screen.getByTestId("composer-preset-item"));

    expect(store.getState().values).toEqual(
      expect.objectContaining({
        permission: "supervised",
        selection: {
          harnessId: "claude",
          modelSlug: "sonnet",
          profileId: null,
        },
        reasoning: "high",
      }),
    );
  });
});
