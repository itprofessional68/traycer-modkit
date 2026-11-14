import type { ChatRunSettings } from "@traycer/protocol/host/agent/gui/subscribe";
import {
  findDefaultModel,
  findSelectedModel,
  PERMISSION_OPTIONS,
  type HarnessOption,
  type PermissionMode,
} from "@/components/home/data/landing-options";
import type {
  ApplyComposerSelectionInput,
  ComposerToolbarCatalog,
  ComposerToolbarStore,
} from "@/stores/composer/composer-toolbar-store";
import type { AgentPreset } from "@/stores/agents/agent-presets-store";

/** What a preset sets on a composer, and what of it this host could not take. */
export interface PresetApplication {
  readonly selection: ApplyComposerSelectionInput;
  readonly permission: PermissionMode;
  /** One sentence per part that could not be applied as saved, else `null`. */
  readonly notice: string | null;
}

type PresetCatalog = Pick<
  ComposerToolbarCatalog,
  | "harnesses"
  | "modelsHarnessId"
  | "modelsProfileId"
  | "models"
  | "modelsLoaded"
>;

/**
 * The composer values a preset resolves to on this host, checked against what
 * the host's catalog has already answered. A harness the host does not offer
 * is still applied - the composer moves to one it can run, as it does for any
 * remembered pick - but the notice says so. A model is checked only when the
 * catalog holds that harness's models for the same account; otherwise the
 * composer resolves the slug when they load. The permission is passed through:
 * the composer clamps it to what the harness honors, `auto` included.
 */
export function applyPreset(
  preset: AgentPreset,
  catalog: PresetCatalog,
): PresetApplication {
  const harness =
    catalog.harnesses?.find((row) => row.id === preset.harnessId) ?? null;
  const harnessLabel = harness?.label ?? preset.harnessId;
  const model = resolvePresetModel(preset, catalog);
  const notices = [
    harnessNotice(catalog.harnesses, harness, harnessLabel),
    model.notice,
    permissionNotice(preset, harness, harnessLabel),
  ].filter((notice) => notice !== null);
  return {
    selection: {
      selection: {
        harnessId: preset.harnessId,
        modelSlug: model.slug,
        profileId: preset.profileId,
      },
      reasoning: preset.reasoningEffort ?? "",
      serviceTier: preset.serviceTier ?? "",
    },
    permission: preset.permissionMode,
    notice: notices.length === 0 ? null : notices.join(" "),
  };
}

function harnessNotice(
  harnesses: PresetCatalog["harnesses"],
  harness: HarnessOption | null,
  harnessLabel: string,
): string | null {
  if (harnesses === undefined) return null;
  if (harness !== null && harness.enabled && harness.available) return null;
  return `${harnessLabel} isn't available on this machine.`;
}

/**
 * The preset's model, or the harness's first one when the catalog holds that
 * harness's models for the same account and no longer lists it.
 */
function resolvePresetModel(
  preset: AgentPreset,
  catalog: PresetCatalog,
): { readonly slug: string; readonly notice: string | null } {
  const kept = { slug: preset.model, notice: null };
  if (
    !catalog.modelsLoaded ||
    catalog.modelsHarnessId !== preset.harnessId ||
    catalog.modelsProfileId !== preset.profileId
  ) {
    return kept;
  }
  const listed = findSelectedModel(catalog.models, {
    harnessId: preset.harnessId,
    modelSlug: preset.model,
    profileId: preset.profileId,
  });
  const fallback = listed === null ? findDefaultModel(catalog.models) : null;
  if (fallback === null) return kept;
  return {
    slug: fallback.slug,
    notice: `${preset.model} isn't offered here, so ${fallback.label} is used.`,
  };
}

function permissionNotice(
  preset: AgentPreset,
  harness: HarnessOption | null,
  harnessLabel: string,
): string | null {
  if (
    harness === null ||
    harness.supportedPermissionModes.includes(preset.permissionMode)
  ) {
    return null;
  }
  const label =
    PERMISSION_OPTIONS.find((option) => option.id === preset.permissionMode)
      ?.label ?? preset.permissionMode;
  return `${harnessLabel} can't run ${label}, so the closest mode is used.`;
}

/**
 * Sets a composer to a preset. Not through `commitSelection`: that restores
 * the harness's remembered effort and tier, and the preset names its own.
 * Returns the notice, if any part could not be applied as saved.
 */
export function applyPresetToToolbar(
  store: ComposerToolbarStore,
  preset: AgentPreset,
): string | null {
  const state = store.getState();
  const application = applyPreset(preset, state.catalog);
  state.applyComposerSelection(application.selection);
  store.getState().setPermission(application.permission);
  return application.notice;
}

/** A preset as the settings a new agent starts with. */
export function presetRunSettings(preset: AgentPreset): ChatRunSettings {
  return {
    harnessId: preset.harnessId,
    model: preset.model,
    permissionMode: preset.permissionMode,
    reasoningEffort: preset.reasoningEffort,
    serviceTier: preset.serviceTier,
    agentMode: "regular",
    profileId: preset.profileId,
    ultracode: false,
  };
}
