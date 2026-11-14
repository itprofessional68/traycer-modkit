import { describe, expect, it } from "vitest";
import type { ChatRunSettings } from "@traycer/protocol/host/agent/gui/subscribe";
import {
  newAgentProject,
  newAgentSeedSettings,
} from "@/lib/agent-presets/new-agent-seed";
import type { AgentPreset } from "@/stores/agents/agent-presets-store";

function settings(model: string): ChatRunSettings {
  return {
    harnessId: "codex",
    model,
    permissionMode: "full_access",
    reasoningEffort: null,
    serviceTier: null,
    agentMode: "regular",
    profileId: null,
    ultracode: false,
  };
}

const PRESET: AgentPreset = {
  id: "preset-1",
  name: "Careful Claude",
  repoPath: "/work/app",
  harnessId: "claude",
  model: "sonnet",
  reasoningEffort: "high",
  serviceTier: "priority",
  permissionMode: "supervised",
  profileId: "work-account",
  isDefault: true,
  updatedAt: 1,
};

describe("newAgentSeedSettings", () => {
  it("prefers the Task's own last settings over the project's default", () => {
    expect(
      newAgentSeedSettings({
        epicRunSettings: settings("task"),
        defaultPreset: PRESET,
        globalLastRunSettings: settings("host"),
        latestSettings: settings("latest"),
      })?.model,
    ).toBe("task");
  });

  it("uses the project's default before the host's last settings", () => {
    expect(
      newAgentSeedSettings({
        epicRunSettings: null,
        defaultPreset: PRESET,
        globalLastRunSettings: settings("host"),
        latestSettings: settings("latest"),
      }),
    ).toEqual({
      harnessId: "claude",
      model: "sonnet",
      permissionMode: "supervised",
      reasoningEffort: "high",
      serviceTier: "priority",
      agentMode: "regular",
      profileId: "work-account",
      ultracode: false,
    });
  });

  it("falls back to the host's last settings, then the Task's latest agent", () => {
    const base = { epicRunSettings: null, defaultPreset: null };
    expect(
      newAgentSeedSettings({
        ...base,
        globalLastRunSettings: settings("host"),
        latestSettings: settings("latest"),
      })?.model,
    ).toBe("host");
    expect(
      newAgentSeedSettings({
        ...base,
        globalLastRunSettings: null,
        latestSettings: settings("latest"),
      })?.model,
    ).toBe("latest");
  });
});

describe("newAgentProject", () => {
  it("is the primary folder, else the first", () => {
    expect(
      newAgentProject({
        folders: ["/a", "/b"],
        folderInfoByPath: {},
        primaryPath: "/b",
      }),
    ).toBe("/b");
    expect(
      newAgentProject({
        folders: ["/a"],
        folderInfoByPath: {},
        primaryPath: null,
      }),
    ).toBe("/a");
  });
});
