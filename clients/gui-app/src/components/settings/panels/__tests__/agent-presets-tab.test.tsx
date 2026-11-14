import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HarnessOption,
  ModelOption,
} from "@/components/home/data/landing-options";

const HOST = "host-a";

// The scope and its gate are other suites' subject: here the scope is one
// ready host and the gate renders what it holds.
const scopeHost = vi.hoisted(() => ({ hostId: "host-a" }));
vi.mock("@/components/settings/host-scope/use-host-scope", () => ({
  usePersonalHostScope: () => ({
    hostId: scopeHost.hostId,
    client: null,
    status: "ready",
    hosts: [{ hostId: "host-b", name: "Studio" }],
  }),
}));
vi.mock("@/components/settings/host-scope/host-scope-gate", () => ({
  HostScopeGate: (props: { readonly children: React.ReactNode }) => (
    <>{props.children}</>
  ),
}));
// The pickers are drawn by their own suites; the form reads what the toolbar
// store resolves, so they are markers here.
vi.mock("@/components/home/pickers/harness-model-picker", () => ({
  HarnessModelPicker: () => <div data-testid="model-picker" />,
}));
vi.mock("@/components/home/pickers/permissions-picker", () => ({
  PermissionsPicker: () => <div data-testid="permissions-picker" />,
}));
vi.mock("@/hooks/host/use-host-supports-method", () => ({
  useHostMethodSchemaVersion: () => null,
}));
const RECENTS_QUERY = { data: { recentWorkspaces: [] } };
vi.mock("@/hooks/workspace/use-workspace-list-recent-workspaces-query", () => ({
  useWorkspaceListRecentWorkspaces: () => RECENTS_QUERY,
}));

const CODEX: HarnessOption = {
  id: "codex",
  label: "Codex",
  enabled: true,
  available: true,
  error: null,
  modes: ["gui", "tui"],
  requiresApiKey: false,
  supportedPermissionModes: ["supervised", "full_access"],
  nativeAutoJudge: false,
  availabilityPending: false,
};

const CODEX_MODEL: ModelOption = {
  harnessId: "codex",
  slug: "gpt-5-codex",
  label: "GPT-5 Codex",
  description: null,
  contextWindow: null,
  maxOutputTokens: null,
  defaultReasoningEffort: null,
  supportedReasoningEfforts: [],
  defaultServiceTier: null,
  supportedServiceTiers: [],
  metadata: {},
};

// One object per query, as a query cache hands back: a fresh array per render
// would push a new catalog on every render.
const HARNESSES_QUERY = { data: { harnesses: [CODEX] } };
const MODELS_QUERY = { data: { models: [CODEX_MODEL] }, isError: false };
vi.mock("@/hooks/harnesses/use-gui-harness-catalog", () => ({
  useGuiHarnessesQueryForClient: () => HARNESSES_QUERY,
  useGuiHarnessModelsQueryForClient: () => MODELS_QUERY,
}));

import { AgentPresetsTab } from "@/components/settings/panels/agent-presets-tab";
import {
  selectHostPresets,
  useAgentPresetsStore,
} from "@/stores/agents/agent-presets-store";
import { useSettingsEnvironmentPickStore } from "@/stores/settings/settings-environment-pick-store";
import { useSettingsStore } from "@/stores/settings/settings-store";

function hostPresets() {
  return selectHostPresets(useAgentPresetsStore.getState(), HOST);
}

describe("<AgentPresetsTab />", () => {
  beforeEach(() => {
    useAgentPresetsStore.getState().resetForTests();
    useSettingsStore.setState({
      defaultSelection: { harnessId: "codex", modelSlug: "", profileId: null },
      defaultPermission: "supervised",
      defaultReasoning: "",
      defaultServiceTier: "",
    });
  });

  afterEach(() => {
    cleanup();
    scopeHost.hostId = HOST;
    useSettingsEnvironmentPickStore.getState().setPick(null);
  });

  it("saves a new preset with the model the host resolves", async () => {
    render(
      <AgentPresetsTab
        requestedHostId={null}
        onRequestSettled={() => undefined}
      />,
    );
    expect(screen.getByText("No presets on this host yet.")).toBeTruthy();

    await userEvent.click(screen.getByTestId("agent-presets-new"));
    await userEvent.type(screen.getByTestId("agent-preset-name"), "Reviewer");
    await userEvent.type(
      screen.getByTestId("agent-preset-project-path"),
      "/work/app/",
    );
    await userEvent.click(screen.getByTestId("agent-preset-default"));
    await userEvent.click(screen.getByTestId("agent-preset-save"));

    expect(hostPresets()).toEqual([
      expect.objectContaining({
        name: "Reviewer",
        repoPath: "/work/app",
        harnessId: "codex",
        model: "gpt-5-codex",
        permissionMode: "supervised",
        isDefault: true,
      }),
    ]);
    expect(screen.queryByTestId("agent-preset-form")).toBeNull();
    expect(screen.getByTestId("agent-preset-row").textContent).toContain(
      "Codex · gpt-5-codex · Supervised",
    );
  });

  it("edits a preset in place and deletes it", async () => {
    useAgentPresetsStore.getState().savePreset(HOST, {
      id: "preset-1",
      name: "Reviewer",
      repoPath: "/work/app",
      harnessId: "codex",
      model: "gpt-5-codex",
      reasoningEffort: null,
      serviceTier: null,
      permissionMode: "supervised",
      profileId: null,
      guideNote: null,
      isDefault: false,
    });
    render(
      <AgentPresetsTab
        requestedHostId={null}
        onRequestSettled={() => undefined}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    const name = screen.getByTestId("agent-preset-name");
    await userEvent.clear(name);
    await userEvent.type(name, "Careful reviewer");
    await userEvent.click(screen.getByTestId("agent-preset-save"));

    expect(hostPresets().map((preset) => [preset.id, preset.name])).toEqual([
      ["preset-1", "Careful reviewer"],
    ]);

    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(hostPresets()).toEqual([]);
  });

  it("moves Settings to the machine a composer asked for before showing its presets", () => {
    const onRequestSettled = vi.fn();
    const { rerender } = render(
      <AgentPresetsTab
        requestedHostId="host-b"
        onRequestSettled={onRequestSettled}
      />,
    );

    expect(useSettingsEnvironmentPickStore.getState().pick).toEqual({
      kind: "local",
      hostId: "host-b",
      hostName: "Studio",
    });
    expect(screen.queryByTestId("agent-presets-tab")).toBeNull();

    scopeHost.hostId = "host-b";
    rerender(
      <AgentPresetsTab
        requestedHostId="host-b"
        onRequestSettled={onRequestSettled}
      />,
    );
    expect(onRequestSettled).toHaveBeenCalled();
    expect(screen.getByTestId("agent-presets-tab")).toBeTruthy();
  });
});
