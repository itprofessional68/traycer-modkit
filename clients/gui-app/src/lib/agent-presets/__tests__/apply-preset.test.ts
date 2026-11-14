import { describe, expect, it } from "vitest";
import type {
  HarnessOption,
  ModelOption,
  ProviderId,
} from "@/components/home/data/landing-options";
import {
  applyPreset,
  applyPresetToToolbar,
} from "@/lib/agent-presets/apply-preset";
import type { AgentPreset } from "@/stores/agents/agent-presets-store";
import { useComposerHarnessMemoryStore } from "@/stores/composer/composer-harness-memory-store";
import {
  createComposerToolbarStore,
  type ComposerToolbarCatalog,
} from "@/stores/composer/composer-toolbar-store";

const HOST = "host-a";

function model(
  harnessId: ProviderId,
  slug: string,
  label: string,
): ModelOption {
  return {
    harnessId,
    slug,
    label,
    description: null,
    contextWindow: null,
    maxOutputTokens: null,
    defaultReasoningEffort: "medium",
    supportedReasoningEfforts: [
      { id: "low", label: "Low", description: null },
      { id: "medium", label: "Medium", description: null },
      { id: "high", label: "High", description: null },
    ],
    defaultServiceTier: null,
    supportedServiceTiers: [],
    metadata: {},
  };
}

function harness(id: ProviderId, available: boolean): HarnessOption {
  return {
    id,
    label: id === "claude" ? "Claude Code" : "Codex",
    enabled: true,
    available,
    error: available ? null : "unavailable",
    modes: ["gui", "tui"],
    requiresApiKey: false,
    supportedPermissionModes: ["supervised", "full_access"],
    nativeAutoJudge: false,
    availabilityPending: false,
  };
}

const CLAUDE_MODELS: ReadonlyArray<ModelOption> = [
  model("claude", "opus", "Opus"),
  model("claude", "sonnet", "Sonnet"),
];

function catalog(input: {
  readonly harnesses: ReadonlyArray<HarnessOption> | undefined;
  readonly modelsHarnessId: ProviderId;
  readonly models: ReadonlyArray<ModelOption>;
  readonly modelsLoaded: boolean;
}): ComposerToolbarCatalog {
  return {
    hostId: HOST,
    harnesses: input.harnesses,
    modelsHarnessId: input.modelsHarnessId,
    modelsProfileId: null,
    models: input.models,
    modelsLoaded: input.modelsLoaded,
    modelsFailed: false,
    tuiOnly: false,
    chatLineCarriesAutoMode: null,
    ultracodeCarried: false,
    keepsUnavailablePick: false,
  };
}

const PRESET: AgentPreset = {
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
  updatedAt: 1,
};

const CLAUDE_LOADED = catalog({
  harnesses: [harness("claude", true), harness("codex", true)],
  modelsHarnessId: "claude",
  models: CLAUDE_MODELS,
  modelsLoaded: true,
});

describe("applyPreset", () => {
  it("applies every saved value when the host offers them", () => {
    expect(applyPreset(PRESET, CLAUDE_LOADED)).toEqual({
      selection: {
        selection: {
          harnessId: "claude",
          modelSlug: "sonnet",
          profileId: null,
        },
        reasoning: "high",
        serviceTier: "",
      },
      permission: "supervised",
      notice: null,
    });
  });

  it("says when the host does not offer the preset's agent", () => {
    const result = applyPreset(
      PRESET,
      catalog({
        harnesses: [harness("claude", false), harness("codex", true)],
        modelsHarnessId: "codex",
        models: [],
        modelsLoaded: true,
      }),
    );
    expect(result.selection.selection.harnessId).toBe("claude");
    expect(result.notice).toBe("Claude Code isn't available on this machine.");
  });

  it("uses the agent's first model when the saved one is no longer listed", () => {
    const result = applyPreset({ ...PRESET, model: "retired" }, CLAUDE_LOADED);
    expect(result.selection.selection.modelSlug).toBe("opus");
    expect(result.notice).toBe("retired isn't offered here, so Opus is used.");
  });

  it("leaves the model to the composer while another agent's models are loaded", () => {
    const result = applyPreset(
      { ...PRESET, model: "retired" },
      catalog({
        harnesses: [harness("claude", true), harness("codex", true)],
        modelsHarnessId: "codex",
        models: [model("codex", "gpt", "GPT")],
        modelsLoaded: true,
      }),
    );
    expect(result.selection.selection.modelSlug).toBe("retired");
    expect(result.notice).toBeNull();
  });

  it("says when the agent can't run the saved permission mode", () => {
    const result = applyPreset(
      { ...PRESET, permissionMode: "auto_accept_edits" },
      CLAUDE_LOADED,
    );
    expect(result.permission).toBe("auto_accept_edits");
    expect(result.notice).toBe(
      "Claude Code can't run Auto-accept edits, so the closest mode is used.",
    );
  });
});

describe("applyPresetToToolbar", () => {
  it("sets the preset's own effort, not the agent's remembered one", () => {
    useComposerHarnessMemoryStore.getState().record(HOST, {
      harnessId: "claude",
      model: "sonnet",
      permissionMode: "full_access",
      reasoningEffort: "low",
      serviceTier: null,
      agentMode: "regular",
      profileId: null,
      ultracode: false,
    });
    const store = createComposerToolbarStore({
      purpose: "run",
      reasoningFallback: "model-default",
      seedKey: "preset-test",
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
      hostId: HOST,
    });
    store.getState().setCatalog(CLAUDE_LOADED);

    expect(applyPresetToToolbar(store, PRESET)).toBeNull();

    const state = store.getState();
    expect(state.selection).toEqual({
      harnessId: "claude",
      modelSlug: "sonnet",
      profileId: null,
    });
    expect(state.reasoning).toBe("high");
    expect(state.permission).toBe("supervised");
  });
});
