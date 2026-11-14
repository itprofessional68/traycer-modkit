/**
 * Docs: see ../SETTINGS.md
 * Update that file whenever this settings surface changes.
 */
import { useLayoutEffect, useState, type ReactNode } from "react";
import { EnvironmentHostBinding } from "@/components/settings/environment/environment-host-binding";
import { carryViewedHostIntoSettingsScope } from "@/components/settings/host-scope/carry-viewed-host-into-settings";
import { AGENT_SELECTION } from "@/components/settings/panels/agents-settings.definitions";
import { AgentDefinitionsTab } from "@/components/settings/panels/agent-definitions-tab";
import { AgentPresetsTab } from "@/components/settings/panels/agent-presets-tab";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  acknowledgeSettingsOpenIntent,
  useSettingsOpenIntent,
} from "@/stores/tabs/settings-open-intent-store";
import { AgentSelectionGuideSection } from "./agent-selection-guide-section";

type AgentsTab = "guide" | "definitions" | "presets";
const AGENTS_TABS: ReadonlyArray<AgentsTab> = [
  "guide",
  "definitions",
  "presets",
];

const AGENTS_TAB_LABELS: Readonly<Record<AgentsTab, string>> = {
  guide: "Selection guide",
  definitions: "Definitions",
  presets: "Presets",
};

// The guide reaches only the agents Traycer creates; a coding agent's own
// native subagents never read it (traycerai/traycer#1090).
const AGENTS_GUIDE_CAPTION =
  "The guide agents read when they pick a coding agent, model and effort for work they hand off.";

function isAgentsTab(value: string): value is AgentsTab {
  return AGENTS_TABS.some((tab) => tab === value);
}

/**
 * Settings ▸ Agents: three tabs. Selection guide is the markdown guide agents
 * read to pick a harness, model and effort, and keeps the full panel height for
 * its editor; Definitions is one file per agent definition a harness can
 * start; Presets are named agent setups per project, kept in this app.
 */
export function AgentsSettingsPanel(): ReactNode {
  const [tab, setTab] = useState<AgentsTab>("guide");
  // An `openSettings` call naming a tab (the composer's "Manage presets…")
  // is applied once per arm during render, so that tab is the first drawn;
  // its machine becomes the Settings scope before paint.
  const intent = useSettingsOpenIntent("agents");
  const [appliedIntentId, setAppliedIntentId] = useState<number | null>(null);
  if (intent !== null && intent.id !== appliedIntentId) {
    setAppliedIntentId(intent.id);
    if (intent.tab !== null && isAgentsTab(intent.tab)) setTab(intent.tab);
  }
  useLayoutEffect(() => {
    if (intent === null) return;
    carryViewedHostIntoSettingsScope(intent.hostId);
    acknowledgeSettingsOpenIntent(intent.id);
  }, [intent]);
  return (
    <SettingsPanelShell
      title={AGENT_SELECTION.page.label}
      description={AGENT_SELECTION.page.description}
      fillHeight
    >
      <Tabs
        value={tab}
        onValueChange={(next) => {
          if (isAgentsTab(next)) setTab(next);
        }}
        className="min-h-0 flex-1 gap-0"
      >
        <TabsList
          variant="line"
          className="h-auto w-full max-w-full shrink-0 flex-wrap justify-start"
        >
          {AGENTS_TABS.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex-none"
              data-testid={`agents-tab-${value}`}
            >
              {AGENTS_TAB_LABELS[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent
          value="guide"
          className="flex min-h-0 flex-1 flex-col gap-3 pt-5"
        >
          <p
            className="min-w-0 text-ui-xs text-muted-foreground"
            data-testid="agents-guide-caption"
          >
            {AGENTS_GUIDE_CAPTION}
          </p>
          <AgentSelectionGuideSection />
        </TabsContent>
        <TabsContent value="definitions" className="pt-5">
          {/* Definitions read the ambient binding, so a Local row's pick
              re-provides it to that computer. */}
          <EnvironmentHostBinding>
            <AgentDefinitionsTab />
          </EnvironmentHostBinding>
        </TabsContent>
        <TabsContent value="presets" className="pt-5">
          <AgentPresetsTab />
        </TabsContent>
      </Tabs>
    </SettingsPanelShell>
  );
}
