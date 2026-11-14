import { z } from "zod";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { guiHarnessIdSchema } from "@traycer/protocol/host/index";
import { permissionModeSchema } from "@traycer/protocol/persistence/epic/foundation";
import { basePersistOptions, persistKey, STORE_KEYS } from "@/lib/persist";

/** How many presets one host keeps; the least recently saved go first. */
export const AGENT_PRESETS_PER_HOST_CAP = 100;

const agentPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** The project's root folder on the preset's host. */
  repoPath: z.string().min(1),
  harnessId: guiHarnessIdSchema,
  model: z.string().min(1),
  reasoningEffort: z.string().nullable(),
  serviceTier: z.string().nullable(),
  permissionMode: permissionModeSchema,
  profileId: z.string().nullable(),
  /**
   * A paragraph the person can add to the project's agent selection guide.
   * Defaulted so presets saved before the field parse.
   */
  guideNote: z.string().nullable().default(null),
  /** Seeds a new agent in this project; at most one per (host, project). */
  isDefault: z.boolean(),
  /** When it was last saved; past the cap the oldest go first. */
  updatedAt: z.number(),
});

export type AgentPreset = z.infer<typeof agentPresetSchema>;

/** A preset as a form saves it; the store stamps `updatedAt`. */
export type AgentPresetDraft = Omit<AgentPreset, "updatedAt">;

const persistedStateSchema = z.object({
  presetsByHostId: z.record(z.string(), z.array(z.unknown())),
});

interface AgentPresetsState {
  /**
   * hostId -> that host's presets. Bucketed by host because a project is a
   * bare local path, which names a different folder on another machine.
   */
  readonly presetsByHostId: Readonly<
    Record<string, ReadonlyArray<AgentPreset>>
  >;
  /** Insert or replace by id. `hostId === null` drops the write. */
  readonly savePreset: (
    hostId: string | null,
    preset: AgentPresetDraft,
  ) => void;
  readonly deletePreset: (hostId: string | null, presetId: string) => void;
  readonly resetForTests: () => void;
}

/** Trailing separators dropped, so `/repo/` and `/repo` name one project. */
export function normalizeRepoPath(path: string): string {
  const trimmed = path.trim();
  const stripped = trimmed.replace(/[\\/]+$/, "");
  return stripped.length === 0 ? trimmed : stripped;
}

/**
 * The host's bucket after one preset is written: a default clears the other
 * defaults of its project, and the bucket keeps the most recently saved
 * `AGENT_PRESETS_PER_HOST_CAP`.
 */
function withPresetSaved(
  bucket: ReadonlyArray<AgentPreset>,
  preset: AgentPreset,
): ReadonlyArray<AgentPreset> {
  const replaced = bucket.some((existing) => existing.id === preset.id);
  const updated = bucket.map((existing) => {
    if (existing.id === preset.id) return preset;
    return preset.isDefault &&
      existing.isDefault &&
      existing.repoPath === preset.repoPath
      ? { ...existing, isDefault: false }
      : existing;
  });
  const next = replaced ? updated : [...updated, preset];
  if (next.length <= AGENT_PRESETS_PER_HOST_CAP) return next;
  const kept = new Set(
    [...next]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, AGENT_PRESETS_PER_HOST_CAP)
      .map((entry) => entry.id),
  );
  return next.filter((entry) => kept.has(entry.id));
}

const EMPTY_PRESETS: ReadonlyArray<AgentPreset> = [];

/** The host's presets, in the order they were created. */
export function selectHostPresets(
  state: Pick<AgentPresetsState, "presetsByHostId">,
  hostId: string | null,
): ReadonlyArray<AgentPreset> {
  if (hostId === null) return EMPTY_PRESETS;
  return Object.hasOwn(state.presetsByHostId, hostId)
    ? state.presetsByHostId[hostId]
    : EMPTY_PRESETS;
}

/** Presets by project, projects in the order their first preset was made. */
export function groupPresetsByProject(
  presets: ReadonlyArray<AgentPreset>,
): ReadonlyArray<readonly [string, ReadonlyArray<AgentPreset>]> {
  const groups = new Map<string, Array<AgentPreset>>();
  for (const preset of presets) {
    const group = groups.get(preset.repoPath) ?? [];
    group.push(preset);
    groups.set(preset.repoPath, group);
  }
  return [...groups.entries()];
}

/** A project's folder name, for a menu; the full path is its title. */
export function presetProjectName(repoPath: string): string {
  const parts = repoPath.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? repoPath;
}

/** The project's default preset on this host, or `null`. */
export function selectDefaultPreset(
  state: Pick<AgentPresetsState, "presetsByHostId">,
  hostId: string | null,
  repoPath: string | null,
): AgentPreset | null {
  if (repoPath === null) return null;
  const project = normalizeRepoPath(repoPath);
  return (
    selectHostPresets(state, hostId).find(
      (preset) => preset.isDefault && preset.repoPath === project,
    ) ?? null
  );
}

/**
 * Persisted presets that still parse. One bad row drops alone, so a preset
 * naming a harness this build no longer knows does not take the rest with it.
 */
export function parsePersistedAgentPresets(
  persisted: unknown,
): Record<string, ReadonlyArray<AgentPreset>> {
  const parsed = persistedStateSchema.safeParse(persisted);
  if (!parsed.success) return {};
  return Object.fromEntries(
    Object.entries(parsed.data.presetsByHostId).map(([hostId, rows]) => [
      hostId,
      rows.flatMap((row) => {
        const preset = agentPresetSchema.safeParse(row);
        return preset.success ? [preset.data] : [];
      }),
    ]),
  );
}

export const useAgentPresetsStore = create<AgentPresetsState>()(
  persist(
    (set) => ({
      presetsByHostId: {},
      savePreset: (hostId, preset) => {
        if (hostId === null) return;
        const saved: AgentPreset = {
          ...preset,
          repoPath: normalizeRepoPath(preset.repoPath),
          updatedAt: Date.now(),
        };
        set((state) => ({
          presetsByHostId: {
            ...state.presetsByHostId,
            [hostId]: withPresetSaved(selectHostPresets(state, hostId), saved),
          },
        }));
      },
      deletePreset: (hostId, presetId) => {
        if (hostId === null) return;
        set((state) => {
          const bucket = selectHostPresets(state, hostId);
          if (!bucket.some((preset) => preset.id === presetId)) return state;
          return {
            presetsByHostId: {
              ...state.presetsByHostId,
              [hostId]: bucket.filter((preset) => preset.id !== presetId),
            },
          };
        });
      },
      resetForTests: () => {
        set({ presetsByHostId: {} });
      },
    }),
    {
      ...basePersistOptions(persistKey(STORE_KEYS.agentPresets)),
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ presetsByHostId: state.presetsByHostId }),
      merge: (persisted, current) => ({
        ...current,
        presetsByHostId: parsePersistedAgentPresets(persisted),
      }),
    },
  ),
);
