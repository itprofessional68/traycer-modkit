import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_PRESETS_PER_HOST_CAP,
  parsePersistedAgentPresets,
  selectDefaultPreset,
  selectHostPresets,
  useAgentPresetsStore,
  type AgentPresetDraft,
} from "@/stores/agents/agent-presets-store";

const HOST_A = "host-a";
const HOST_B = "host-b";

function preset(overrides: Partial<AgentPresetDraft>): AgentPresetDraft {
  return {
    id: "preset-1",
    name: "Careful Claude",
    repoPath: "/work/app",
    harnessId: "claude",
    model: "sonnet",
    reasoningEffort: "high",
    serviceTier: null,
    permissionMode: "supervised",
    profileId: null,
    guideNote: null,
    isDefault: false,
    ...overrides,
  };
}

describe("agent presets store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useAgentPresetsStore.getState().resetForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps each host's presets apart and drops a write with no host", () => {
    const { savePreset } = useAgentPresetsStore.getState();
    savePreset(HOST_A, preset({ id: "a" }));
    savePreset(null, preset({ id: "lost" }));

    const state = useAgentPresetsStore.getState();
    expect(selectHostPresets(state, HOST_A).map((row) => row.id)).toEqual([
      "a",
    ]);
    expect(selectHostPresets(state, HOST_B)).toEqual([]);
    expect(Object.keys(state.presetsByHostId)).toEqual([HOST_A]);
  });

  it("keeps one default per project and finds it by either spelling of the path", () => {
    const { savePreset } = useAgentPresetsStore.getState();
    savePreset(HOST_A, preset({ id: "first", isDefault: true }));
    savePreset(
      HOST_A,
      preset({ id: "other-project", repoPath: "/work/api", isDefault: true }),
    );
    savePreset(
      HOST_A,
      preset({ id: "second", repoPath: "/work/app/", isDefault: true }),
    );

    const state = useAgentPresetsStore.getState();
    expect(
      selectHostPresets(state, HOST_A).map((row) => [row.id, row.isDefault]),
    ).toEqual([
      ["first", false],
      ["other-project", true],
      ["second", true],
    ]);
    expect(selectDefaultPreset(state, HOST_A, "/work/app")?.id).toBe("second");
    expect(selectDefaultPreset(state, HOST_B, "/work/app")).toBeNull();
  });

  it("edits a preset in place and deletes it", () => {
    const { savePreset, deletePreset } = useAgentPresetsStore.getState();
    savePreset(HOST_A, preset({ id: "a" }));
    savePreset(HOST_A, preset({ id: "b" }));
    savePreset(HOST_A, preset({ id: "a", name: "Renamed" }));

    expect(
      selectHostPresets(useAgentPresetsStore.getState(), HOST_A).map(
        (row) => row.name,
      ),
    ).toEqual(["Renamed", "Careful Claude"]);

    deletePreset(HOST_A, "a");
    expect(
      selectHostPresets(useAgentPresetsStore.getState(), HOST_A).map(
        (row) => row.id,
      ),
    ).toEqual(["b"]);
  });

  it("drops the least recently saved preset past the cap", () => {
    const { savePreset } = useAgentPresetsStore.getState();
    for (let index = 0; index <= AGENT_PRESETS_PER_HOST_CAP; index += 1) {
      vi.setSystemTime(index);
      savePreset(HOST_A, preset({ id: `p${index}` }));
    }

    const ids = selectHostPresets(useAgentPresetsStore.getState(), HOST_A).map(
      (row) => row.id,
    );
    expect(ids).toHaveLength(AGENT_PRESETS_PER_HOST_CAP);
    expect(ids).not.toContain("p0");
  });

  it("restores the rows that still parse and drops the rest", () => {
    expect(
      parsePersistedAgentPresets({
        presetsByHostId: {
          [HOST_A]: [
            { ...preset({ id: "ok" }), updatedAt: 1 },
            { ...preset({}), harnessId: "gone", updatedAt: 1 },
          ],
        },
      }),
    ).toEqual({ [HOST_A]: [{ ...preset({ id: "ok" }), updatedAt: 1 }] });
    expect(parsePersistedAgentPresets("not an object")).toEqual({});
  });
});
