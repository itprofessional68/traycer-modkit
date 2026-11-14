/**
 * Docs: see ../SETTINGS.md (Agents ▸ Presets).
 * Update that file whenever this settings surface changes.
 */
import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import {
  autoModeOfferableHere,
  catalogSupportedPermissionModes,
  isFastModeEnabled,
  PERMISSION_OPTIONS,
  type ProviderId,
} from "@/components/home/data/landing-options";
import { chatMaxModeContextForToolbar } from "@/components/home/data/model-max-mode";
import {
  HarnessModelPicker,
  type HarnessModelPickerEmbedding,
} from "@/components/home/pickers/harness-model-picker";
import { PermissionsPicker } from "@/components/home/pickers/permissions-picker";
import { useHostOptions } from "@/components/settings/host-scope/use-host-options";
import { usePersonalHostScope } from "@/components/settings/host-scope/use-host-scope";
import { usePresetToolbarStore } from "@/components/settings/panels/use-preset-toolbar-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useGuiHarnessesQueryForClient } from "@/hooks/harnesses/use-gui-harness-catalog";
import { useHostClientForHostId } from "@/hooks/host/use-host-client-for-host-id";
import { useHostMethodSchemaVersion } from "@/hooks/host/use-host-supports-method";
import { useWorkspaceListRecentWorkspaces } from "@/hooks/workspace/use-workspace-list-recent-workspaces-query";
import { PresetGuideNoteButton } from "@/components/settings/panels/preset-guide-note-button";
import type { HostRpcRegistry } from "@/lib/host";
import {
  normalizeRepoPath,
  groupPresetsByProject,
  selectHostPresets,
  useAgentPresetsStore,
  type AgentPreset,
} from "@/stores/agents/agent-presets-store";
import type {
  ComposerToolbarStore,
  ComposerToolbarValues,
} from "@/stores/composer/composer-toolbar-store";
import { useSettingsStore } from "@/stores/settings/settings-store";

const PRESETS_CAPTION =
  "Saved agent setups for a project on this machine. Pick one from the composer's Presets menu; a project's default starts new agents there.";

const OTHER_PROJECT = "__other__";

type Editing =
  | { readonly kind: "closed" }
  | { readonly kind: "new" }
  | { readonly kind: "edit"; readonly preset: AgentPreset };

/**
 * Settings ▸ Agents ▸ Presets. Presets are this app's own data, kept per
 * machine, not a file on a host, so the tab names its machine itself rather
 * than moving the Settings scope: it shows the machine Settings is showing
 * until one is chosen here, or until a composer's "Manage presets…" names its
 * own (`hostId`). Reads go through that machine's client, so nothing here
 * re-provides the ambient binding.
 */
export function AgentPresetsTab(props: {
  readonly hostId: string | null;
  readonly onHostChange: (hostId: string) => void;
}): ReactNode {
  const scope = usePersonalHostScope();
  const options = useHostOptions();
  const hostId = props.hostId ?? scope.hostId;
  const namedClient = useHostClientForHostId(hostId);
  const client = hostId === null ? null : namedClient;
  const host = options.hosts.find((row) => row.hostId === hostId) ?? null;
  const machineId = useId();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor={machineId}>Machine</Label>
        <Select
          value={hostId ?? ""}
          onValueChange={(next) => props.onHostChange(next)}
        >
          <SelectTrigger
            id={machineId}
            className="w-full"
            data-testid="agent-presets-machine"
          >
            <SelectValue placeholder="Choose a machine" />
          </SelectTrigger>
          <SelectContent>
            {options.hosts.map((row) => (
              <SelectItem key={row.hostId} value={row.hostId}>
                {row.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <AgentPresetsBody
        key={hostId}
        hostId={hostId}
        client={client}
        connectable={host?.connectable === true}
      />
    </div>
  );
}

function AgentPresetsBody(props: {
  readonly hostId: string | null;
  readonly client: HostClient<HostRpcRegistry> | null;
  /** The machine answers now; its agents and models are needed to edit. */
  readonly connectable: boolean;
}): ReactNode {
  const { hostId, client, connectable } = props;
  const presets = useAgentPresetsStore((state) =>
    selectHostPresets(state, hostId),
  );
  const deletePreset = useAgentPresetsStore((state) => state.deletePreset);
  const [editing, setEditing] = useState<Editing>({ kind: "closed" });
  const harnesses = useGuiHarnessesQueryForClient(client, {
    enabled: true,
    subscribed: true,
  }).data?.harnesses;
  const recents = useWorkspaceListRecentWorkspaces({ client, enabled: true })
    .data?.recentWorkspaces;
  const projects = useMemo(
    () => knownProjects(presets, recents?.map((row) => row.path) ?? []),
    [presets, recents],
  );
  const groups = useMemo(() => groupPresetsByProject(presets), [presets]);
  const harnessLabel = (id: string): string =>
    harnesses?.find((row) => row.id === id)?.label ?? id;

  return (
    <div className="flex flex-col gap-4" data-testid="agent-presets-tab">
      <p className="text-ui-xs text-muted-foreground">{PRESETS_CAPTION}</p>
      {hostId !== null && !connectable ? (
        <p className="text-ui-xs text-muted-foreground">
          This machine isn&apos;t connected, so its presets can&apos;t be edited
          right now.
        </p>
      ) : null}
      {editing.kind === "closed" ? (
        <div>
          <Button
            type="button"
            size="sm"
            disabled={hostId === null || !connectable}
            data-testid="agent-presets-new"
            onClick={() => setEditing({ kind: "new" })}
          >
            New preset
          </Button>
        </div>
      ) : (
        <AgentPresetForm
          key={editing.kind === "edit" ? editing.preset.id : "new"}
          hostId={hostId}
          client={client}
          preset={editing.kind === "edit" ? editing.preset : null}
          projects={projects}
          onDone={() => setEditing({ kind: "closed" })}
        />
      )}
      {presets.length === 0 ? (
        <p className="text-ui-sm text-muted-foreground">
          No presets on this host yet.
        </p>
      ) : (
        groups.map(([repoPath, rows]) => (
          <section key={repoPath} className="flex flex-col gap-1">
            <h3 className="truncate text-ui-xs font-medium text-muted-foreground">
              {repoPath}
            </h3>
            <ul className="flex flex-col divide-y divide-border/60 rounded-md border border-border/60">
              {rows.map((preset) => (
                <li
                  key={preset.id}
                  className="flex min-w-0 items-center gap-2 p-2"
                  data-testid="agent-preset-row"
                >
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2 text-ui-sm">
                      <span className="truncate">{preset.name}</span>
                      {preset.isDefault ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : null}
                    </span>
                    <span className="truncate text-ui-xs text-muted-foreground">
                      {presetSummary(preset, harnessLabel(preset.harnessId))}
                    </span>
                  </div>
                  {preset.guideNote === null || !connectable ? null : (
                    <PresetGuideNoteButton
                      client={client}
                      repoPath={preset.repoPath}
                      note={preset.guideNote}
                    />
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={!connectable}
                    onClick={() => setEditing({ kind: "edit", preset })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      deletePreset(hostId, preset.id);
                      if (
                        editing.kind === "edit" &&
                        editing.preset.id === preset.id
                      ) {
                        setEditing({ kind: "closed" });
                      }
                    }}
                  >
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

function AgentPresetForm(props: {
  readonly hostId: string | null;
  readonly client: HostClient<HostRpcRegistry> | null;
  readonly preset: AgentPreset | null;
  readonly projects: ReadonlyArray<string>;
  readonly onDone: () => void;
}): ReactNode {
  const { hostId, client, preset, projects, onDone } = props;
  const savePreset = useAgentPresetsStore((state) => state.savePreset);
  const defaults = useSettingsStore(
    useShallow((state) => ({
      permission: state.defaultPermission,
      selection: state.defaultSelection,
      reasoning: state.defaultReasoning,
      serviceTier: state.defaultServiceTier,
    })),
  );
  const [seed] = useState(() => presetFormSeed(preset, defaults));
  const store = usePresetToolbarStore({ client, values: seed });
  const embedding = usePresetPickerEmbedding(store, hostId === null);
  const [fields] = useState(() => presetFormFields(preset, projects));
  const [name, setName] = useState(fields.name);
  const [repoPath, setRepoPath] = useState(fields.repoPath);
  const [typingPath, setTypingPath] = useState(projects.length === 0);
  const [isDefault, setIsDefault] = useState(fields.isDefault);
  const [guideNote, setGuideNote] = useState(fields.guideNote);
  const nameId = useId();
  const projectId = useId();
  const guideNoteId = useId();
  const defaultId = useId();

  const modelSlug = useStore(store, (state) => state.selection.modelSlug);
  const reasoning = useStore(store, (state) => state.reasoning);
  const serviceTier = useStore(store, (state) => state.serviceTier);
  const permission = useStore(store, (state) => state.permission);
  const setPermission = useStore(store, (state) => state.setPermission);
  const supportedPermissionModes = useStore(
    store,
    (state) => state.supportedPermissionModes,
  );
  const harnessLabel = useStore(store, (state) => state.harnessLabel);
  const harnesses = useStore(store, (state) => state.catalog.harnesses);
  const catalogSupportedModes = useMemo(
    () => catalogSupportedPermissionModes(harnesses),
    [harnesses],
  );
  const listHarnessesLine = useHostMethodSchemaVersion(
    hostId,
    "agent.gui.listHarnesses",
  );
  const maxModeContext = useMemo(
    () => chatMaxModeContextForToolbar(reasoning, serviceTier),
    [reasoning, serviceTier],
  );

  const trimmedName = name.trim();
  const project = normalizeRepoPath(repoPath);
  const canSave =
    hostId !== null &&
    trimmedName.length > 0 &&
    project.length > 0 &&
    modelSlug.length > 0;

  const save = (): void => {
    if (!canSave) return;
    const state = store.getState();
    savePreset(hostId, {
      id: preset?.id ?? crypto.randomUUID(),
      name: trimmedName,
      repoPath: project,
      harnessId: state.selection.harnessId,
      model: state.selection.modelSlug,
      reasoningEffort: state.reasoning.length === 0 ? null : state.reasoning,
      serviceTier: state.serviceTier.length === 0 ? null : state.serviceTier,
      permissionMode: state.permission,
      profileId: state.selection.profileId,
      guideNote: guideNote.trim().length === 0 ? null : guideNote.trim(),
      isDefault,
    });
    onDone();
  };

  const projectChoices =
    projects.includes(project) || project.length === 0
      ? projects
      : [project, ...projects];

  return (
    <form
      data-testid="agent-preset-form"
      className="flex flex-col gap-3 rounded-md border border-border/60 bg-foreground/3 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={nameId}>Name</Label>
        <Input
          id={nameId}
          value={name}
          placeholder="What this setup is for"
          data-testid="agent-preset-name"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={projectId}>Project</Label>
        {typingPath ? (
          <Input
            id={projectId}
            value={repoPath}
            placeholder="/path/to/project"
            data-testid="agent-preset-project-path"
            onChange={(event) => setRepoPath(event.target.value)}
          />
        ) : (
          <Select
            value={project}
            onValueChange={(next) => {
              if (next === OTHER_PROJECT) {
                setTypingPath(true);
                setRepoPath("");
                return;
              }
              setRepoPath(next);
            }}
          >
            <SelectTrigger
              id={projectId}
              className="w-full"
              data-testid="agent-preset-project"
            >
              <SelectValue placeholder="Choose a project" />
            </SelectTrigger>
            <SelectContent>
              {projectChoices.map((path) => (
                <SelectItem key={path} value={path}>
                  {path}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_PROJECT}>Another folder…</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-ui-xs text-muted-foreground">Model</span>
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          <HarnessModelPicker
            withUltracode={false}
            labelDisplay="responsive"
            maxModeContext={maxModeContext}
            store={store}
            withServiceTier
            withReasoning
            tuiOnly={false}
            lockedHarnessId={null}
            disabled={hostId === null}
            registerActivation={false}
            createProfileHostId={hostId}
            runTargetHostId={hostId}
            terminalLoginSurface={null}
            profileAdmission={null}
            embedding={embedding}
          />
          <PermissionsPicker
            value={permission}
            disabled={hostId === null}
            onChange={setPermission}
            supportedPermissionModes={supportedPermissionModes}
            harnessLabel={harnessLabel}
            catalogSupportedModes={catalogSupportedModes}
            hostKnowsAutoMode={
              hostId === null
                ? null
                : autoModeOfferableHere(listHarnessesLine, null)
            }
            turnActive={false}
            judgeBilling={null}
            closeFocus="trigger"
            onOpenPermissionSettings={null}
            interactive={false}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={guideNoteId}>Guide note</Label>
        <Textarea
          id={guideNoteId}
          value={guideNote}
          size="sm"
          rows={3}
          placeholder="A paragraph for this project's agent selection guide (optional)"
          data-testid="agent-preset-guide-note"
          onChange={(event) => setGuideNote(event.target.value)}
        />
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id={defaultId}
          checked={isDefault}
          data-testid="agent-preset-default"
          onCheckedChange={setIsDefault}
        />
        <Label htmlFor={defaultId}>Use for new agents in this project</Label>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!canSave}
          data-testid="agent-preset-save"
        >
          Save preset
        </Button>
      </div>
    </form>
  );
}

/** The form's text fields: the preset's, or empty in the first project. */
function presetFormFields(
  preset: AgentPreset | null,
  projects: ReadonlyArray<string>,
): {
  readonly name: string;
  readonly repoPath: string;
  readonly isDefault: boolean;
  readonly guideNote: string;
} {
  if (preset === null) {
    return {
      name: "",
      repoPath: projects.length > 0 ? projects[0] : "",
      isDefault: false,
      guideNote: "",
    };
  }
  return {
    name: preset.name,
    repoPath: preset.repoPath,
    isDefault: preset.isDefault,
    guideNote: preset.guideNote ?? "",
  };
}

/** The pickers' values: the preset's, or the app's defaults for a new one. */
function presetFormSeed(
  preset: AgentPreset | null,
  defaults: Omit<ComposerToolbarValues, "ultracode">,
): ComposerToolbarValues {
  if (preset === null) return { ...defaults, ultracode: false };
  return {
    permission: preset.permissionMode,
    selection: {
      harnessId: preset.harnessId,
      modelSlug: preset.model,
      profileId: preset.profileId,
    },
    reasoning: preset.reasoningEffort ?? "",
    serviceTier: preset.serviceTier ?? "",
    ultracode: false,
  };
}

/** The projects a preset can be saved for: existing ones, then recents. */
function knownProjects(
  presets: ReadonlyArray<AgentPreset>,
  recentPaths: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  for (const path of [
    ...presets.map((preset) => preset.repoPath),
    ...recentPaths.map(normalizeRepoPath),
  ]) {
    if (path.length > 0) seen.add(path);
  }
  return [...seen];
}

function presetSummary(preset: AgentPreset, harnessLabel: string): string {
  const permission =
    PERMISSION_OPTIONS.find((option) => option.id === preset.permissionMode)
      ?.label ?? preset.permissionMode;
  return [harnessLabel, preset.model, preset.reasoningEffort, permission]
    .filter((part) => part !== null)
    .join(" · ");
}

/**
 * The model picker's Settings embedding: its own face, and no composer
 * behaviour. Without one the picker is a composer's - closing it hands focus
 * to whichever composer is registered, which can pull the window away from
 * Settings, and a provider switch restores the model last used in a chat.
 * Here a switch keeps the model on a click of the provider already chosen and
 * otherwise lands on that provider's first model once its catalog loads
 * (`""`, which the setting store resolves).
 */
function usePresetPickerEmbedding(
  store: ComposerToolbarStore,
  disabled: boolean,
): HarnessModelPickerEmbedding {
  const harnessLabel = useStore(store, (state) => state.harnessLabel);
  const selection = useStore(store, (state) => state.selection);
  const modelLabel = useStore(
    store,
    (state) => state.selectedModel?.label ?? state.selection.modelSlug,
  );
  const reasoning = useStore(store, (state) => state.reasoning);
  const fast = useStore(store, (state) => isFastModeEnabled(state.serviceTier));
  const openRef = useRef<(() => void) | null>(null);
  const providerSwitchModel = useCallback(
    (next: ProviderId): string => {
      const current = store.getState().values.selection;
      return current.harnessId === next ? current.modelSlug : "";
    },
    [store],
  );
  const face = [
    harnessLabel ?? selection.harnessId,
    modelLabel.length === 0 ? "Choose a model" : modelLabel,
    reasoning.length === 0 ? null : reasoning,
    fast ? "Fast" : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  return useMemo(
    () => ({
      trigger: (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="agent-preset-model"
        >
          {face}
        </Button>
      ),
      providerSwitchModel,
      selectionMarked: true,
      openRef,
      closeRef: null,
      followSelectionRef: null,
      onOpenChange: null,
      footer: null,
    }),
    [disabled, face, providerSwitchModel],
  );
}
