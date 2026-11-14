import { useMemo, useRef, type ReactNode } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "zustand";
import { ToolbarIconButton } from "@/components/home/toolbar/toolbar-buttons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { applyPresetToToolbar } from "@/lib/agent-presets/apply-preset";
import { focusActiveComposer } from "@/lib/composer/composer-focus-registry";
import {
  groupPresetsByProject,
  selectHostPresets,
  useAgentPresetsStore,
} from "@/stores/agents/agent-presets-store";
import type { ComposerToolbarStore } from "@/stores/composer/composer-toolbar-store";
import { useSystemTabModalActions } from "@/stores/tabs/use-system-tab-modal";

const PRESETS_LABEL = "Presets";

/**
 * The composer's Presets menu, beside the model picker: the presets saved for
 * the composer's host, grouped by project, plus a way to manage them. Hidden
 * while that host has none. Read by the store's catalog host - the machine
 * whose agents and models the composer is offering - since a preset names a
 * model on one machine.
 */
export function ComposerPresetsMenu(props: {
  readonly store: ComposerToolbarStore;
  readonly disabled: boolean;
}): ReactNode {
  const { store, disabled } = props;
  const hostId = useStore(store, (state) => state.catalog.hostId);
  const presets = useAgentPresetsStore((state) =>
    selectHostPresets(state, hostId),
  );
  const groups = useMemo(() => groupPresetsByProject(presets), [presets]);
  const { openSettings } = useSystemTabModalActions();
  const openingSettingsRef = useRef(false);
  if (hostId === null || presets.length === 0) return null;

  return (
    <DropdownMenu>
      <TooltipWrapper
        label={PRESETS_LABEL}
        side="top"
        sideOffset={undefined}
        align={undefined}
      >
        <DropdownMenuTrigger asChild>
          <ToolbarIconButton
            aria-label={PRESETS_LABEL}
            disabled={disabled}
            data-testid="composer-presets-trigger"
          >
            <Bookmark className="size-4 shrink-0" />
          </ToolbarIconButton>
        </DropdownMenuTrigger>
      </TooltipWrapper>
      <DropdownMenuContent
        align="start"
        className="min-w-[min(90vw,16rem)]"
        onCloseAutoFocus={(event) => {
          if (openingSettingsRef.current) {
            openingSettingsRef.current = false;
            event.preventDefault();
            return;
          }
          if (focusActiveComposer()) event.preventDefault();
        }}
      >
        {groups.map(([repoPath, rows]) => (
          <DropdownMenuGroup key={repoPath}>
            <DropdownMenuLabel title={repoPath}>
              {projectName(repoPath)}
            </DropdownMenuLabel>
            {rows.map((preset) => (
              <DropdownMenuItem
                key={preset.id}
                data-testid="composer-preset-item"
                onSelect={() => {
                  const notice = applyPresetToToolbar(store, preset);
                  if (notice !== null) toast.warning(notice);
                }}
              >
                <span className="truncate">{preset.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            openingSettingsRef.current = true;
            openSettings({
              section: "agents",
              tab: "presets",
              draft: null,
              resetToGeneral: false,
              hostId,
            });
          }}
        >
          Manage presets…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The folder's own name; the full path is the label's title. */
function projectName(repoPath: string): string {
  const parts = repoPath.split(/[\\/]/).filter((part) => part.length > 0);
  return parts.at(-1) ?? repoPath;
}
