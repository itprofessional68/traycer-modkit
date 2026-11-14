import type { ChatRunSettings } from "@traycer/protocol/host/agent/gui/subscribe";
import { presetRunSettings } from "@/lib/agent-presets/apply-preset";
import type { AgentPreset } from "@/stores/agents/agent-presets-store";
import type { LandingDraftWorkspaceSnapshot } from "@/stores/home/landing-draft-store";

/** The project a new agent starts in: the workspace's primary folder. */
export function newAgentProject(
  workspace: LandingDraftWorkspaceSnapshot,
): string | null {
  if (workspace.primaryPath !== null) return workspace.primaryPath;
  return workspace.folders.length > 0 ? workspace.folders[0] : null;
}

/**
 * The settings a new agent in a Task starts from, first match wins: the
 * Task's last settings on this host, the project's default preset, the host's
 * last settings, then the Task's latest agent. The Task's own memory wins
 * because it is the more specific choice the person already made there.
 */
export function newAgentSeedSettings(input: {
  readonly epicRunSettings: ChatRunSettings | null;
  readonly defaultPreset: AgentPreset | null;
  readonly globalLastRunSettings: ChatRunSettings | null;
  readonly latestSettings: ChatRunSettings | null;
}): ChatRunSettings | null {
  if (input.epicRunSettings !== null) return input.epicRunSettings;
  if (input.defaultPreset !== null) {
    return presetRunSettings(input.defaultPreset);
  }
  return input.globalLastRunSettings ?? input.latestSettings;
}
