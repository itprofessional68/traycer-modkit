/**
 * Docs: see ../SETTINGS.md (Agents ▸ Presets).
 * Update that file whenever this settings surface changes.
 */
import { useId, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type { HostClient } from "@traycer-clients/shared/host-client/host-client";
import {
  autoModeOfferableHere,
  catalogSupportedPermissionModes,
  PERMISSION_OPTIONS,
} from "@/components/home/data/landing-options";
import { chatMaxModeContextForToolbar } from "@/components/home/data/model-max-mode";
import { HarnessModelPicker } from "@/components/home/pickers/harness-model-picker";
import { PermissionsPicker } from "@/components/home/pickers/permissions-picker";
import { HostScopeGate } from "@/components/settings/host-scope/host-scope-gate";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { useGuiHarnessesQueryForClient } from "@/hooks/harnesses/use-gui-harness-catalog";
import { useHostMethodSchemaVersion } from "@/hooks/host/use-host-supports-method";
import { useWorkspaceListRecentWorkspaces } from "@/hooks/workspace/use-workspace-list-recent-workspaces-query";
import type { HostRpcRegistry } from "@/lib/host";
import {
  normalizeRepoPath,
  groupPresetsByProject,
  selectHostPresets,
  useAgentPresetsStore,
  type AgentPreset,
} from "@/stores/agents/agent-presets-store";
import type { ComposerToolbarValues } from "@/stores/composer/composer-toolbar-store";
import { useSettingsStore } from "@/stores/settings/settings-store";

const PRESETS_CAPTION =
  "Saved agent setups for a project on this host. Pick one from the composer's Presets menu; a project's default starts new agents there.";

const OTHER_PROJECT = "__other__";

type Editing =
  | { readonly kind: "closed" }
  | { readonly kind: "new" }
  | { readonly kind: "edit"; readonly preset: AgentPreset };

/**
 * Settings ▸ Agents ▸ Presets, for the host the sidebar names. Reads go
 * through the scope's own client, so nothing here re-provides the ambient
 * binding.
 */
export function AgentPresetsTab(): ReactNode {
  const scope = usePersonalHostScope();
  return (
    <HostScopeGate
      scope={scope}
      skeleton={<Skeleton className="h-24 w-full" />}
    >
      <AgentPresetsBody hostId={scope.hostId} client={scope.client} />
    </HostScopeGate>
  );
}

function AgentPresetsBody(props: {
  readonly hostId: string | null;
  readonly client: HostClient<HostRpcRegistry> | null;
}): ReactNode {
  const { hostId, client } = props;
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
      {editing.kind === "closed" ? (
        <div>
          <Button
            type="button"
            size="sm"
            disabled={hostId === null}
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
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
  const [seed] = useState<ComposerToolbarValues>(() =>
    preset === null
      ? { ...defaults, ultracode: false }
      : {
          permission: preset.permissionMode,
          selection: {
            harnessId: preset.harnessId,
            modelSlug: preset.model,
            profileId: preset.profileId,
          },
          reasoning: preset.reasoningEffort ?? "",
          serviceTier: preset.serviceTier ?? "",
          ultracode: false,
        },
  );
  const store = usePresetToolbarStore({ client, values: seed });
  const [name, setName] = useState(preset?.name ?? "");
  const [repoPath, setRepoPath] = useState(
    preset?.repoPath ?? (projects.length > 0 ? projects[0] : ""),
  );
  const [typingPath, setTypingPath] = useState(projects.length === 0);
  const [isDefault, setIsDefault] = useState(preset?.isDefault ?? false);
  const nameId = useId();
  const projectId = useId();
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
            embedding={null}
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
