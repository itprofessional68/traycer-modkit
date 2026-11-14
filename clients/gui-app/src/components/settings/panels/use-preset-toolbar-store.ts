import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import type { ModelOption } from "@/components/home/data/landing-options";
import {
  useGuiHarnessesQueryForClient,
  useGuiHarnessModelsQueryForClient,
} from "@/hooks/harnesses/use-gui-harness-catalog";
import type { HostRpcRegistry } from "@/lib/host";
import {
  createComposerToolbarStore,
  type ComposerToolbarStore,
  type ComposerToolbarValues,
} from "@/stores/composer/composer-toolbar-store";

const EMPTY_MODELS: ReadonlyArray<ModelOption> = [];

/**
 * The toolbar store behind a preset's model and access pickers, seeded once
 * with `values` (the form is keyed per preset it edits).
 *
 * Built with `createComposerToolbarStore`, not `useComposerToolbarStore`: that
 * hook records every confirmed pick in composer memory, and editing a preset
 * must not change what the next chat on that agent offers. The catalog's
 * `hostId` is `null` for the same reason; the pickers read the preset's host
 * through their own `runTargetHostId`.
 *
 * `purpose: "setting"`: the form shows what the preset stores, an agent this
 * host cannot run included, and a provider switch lands on that provider's
 * first model once its catalog loads.
 */
export function usePresetToolbarStore(input: {
  readonly client: HostClient<HostRpcRegistry> | null;
  readonly values: ComposerToolbarValues;
}): ComposerToolbarStore {
  const { client } = input;
  const [store] = useState(() =>
    createComposerToolbarStore({
      purpose: "setting",
      reasoningFallback: "model-default",
      seedKey: "agent-preset",
      values: input.values,
      onSettingsChange: null,
      tuiOnly: false,
      chatLineCarriesAutoMode: null,
      ultracodeCarried: false,
      hostId: null,
    }),
  );
  const harnesses = useGuiHarnessesQueryForClient(client, {
    enabled: true,
    subscribed: true,
  }).data?.harnesses;
  const harnessId = useStore(store, (state) => state.selection.harnessId);
  const profileId = useStore(store, (state) => state.selection.profileId);
  const available =
    harnesses?.find((row) => row.id === harnessId)?.available === true;
  const modelsQuery = useGuiHarnessModelsQueryForClient(
    client,
    harnessId,
    null,
    { profileId, enabled: available, subscribed: true },
  );
  const models = modelsQuery.data?.models;
  const modelsFailed = modelsQuery.isError && models === undefined;
  useEffect(() => {
    store.getState().setCatalog({
      hostId: null,
      chatLineCarriesAutoMode: null,
      ultracodeCarried: false,
      harnesses,
      modelsHarnessId: harnessId,
      modelsProfileId: profileId,
      models: models ?? EMPTY_MODELS,
      modelsLoaded: models !== undefined,
      modelsFailed,
      tuiOnly: false,
      keepsUnavailablePick: false,
    });
  }, [store, harnesses, harnessId, profileId, models, modelsFailed]);
  return store;
}
