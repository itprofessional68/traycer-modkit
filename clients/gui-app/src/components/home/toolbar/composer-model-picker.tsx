import { useMemo, type ReactNode } from "react";
import { useStore } from "zustand";
import { HarnessModelPicker } from "@/components/home/pickers/harness-model-picker";
import { chatMaxModeContextForToolbar } from "@/components/home/data/model-max-mode";
import { ComposerPresetsMenu } from "@/components/home/toolbar/composer-presets-menu";
import type { ComposerToolbarItemsProps } from "@/components/home/toolbar/composer-toolbar-item";

export function ComposerModelPicker(
  props: ComposerToolbarItemsProps,
): ReactNode {
  const reasoning = useStore(props.store, (state) => state.reasoning);
  const serviceTier = useStore(props.store, (state) => state.serviceTier);
  const maxModeContext = useMemo(
    () => chatMaxModeContextForToolbar(reasoning, serviceTier),
    [reasoning, serviceTier],
  );
  const picker = (
    <HarnessModelPicker
      withUltracode
      labelDisplay="responsive"
      store={props.store}
      maxModeContext={maxModeContext}
      withServiceTier
      withReasoning
      tuiOnly={false}
      lockedHarnessId={null}
      disabled={props.settingsLocked}
      registerActivation={!props.presentation}
      presentation={props.presentation}
      createProfileHostId={props.createProfileHostId}
      runTargetHostId={props.runTargetHostId}
      terminalLoginSurface={props.terminalLoginSurface}
      profileAdmission={null}
      embedding={null}
    />
  );
  // The sample workspace draws this toolbar too; a preset there would apply
  // to nothing.
  if (props.presentation) return picker;
  return (
    <>
      {picker}
      <ComposerPresetsMenu
        store={props.store}
        disabled={props.settingsLocked}
      />
    </>
  );
}
