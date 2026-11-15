import { Fragment, useMemo, useSyncExternalStore } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import { useAgentConfigure } from "@/hooks/agent/use-configure-agent-mutation";
import { useHostClientForHostId } from "@/hooks/host/use-host-client-for-host-id";
import { useHostMethodSchemaVersion } from "@/hooks/host/use-host-supports-method";
import { presetConfigureRequest } from "@/lib/agent-presets/apply-preset";
import { agentConfigureCarriesRouting } from "@/lib/chat/chat-routing-setting";
import { useExistingChatSessionHandle } from "@/lib/registries/chat-session-registry";
import {
  groupPresetsByProject,
  presetProjectName,
  selectHostPresets,
  useAgentPresetsStore,
} from "@/stores/agents/agent-presets-store";

const NO_SUBSCRIBE = (): (() => void) => () => {};

interface ChatPresetTabMenuProps {
  readonly epicId: string;
  readonly chatId: string;
  readonly hostId: string;
}

/**
 * The tab menu's "Apply preset" for one chat: moves the chat onto one of its
 * host's presets through `agent.configure`. Offered only while the tab holds
 * the chat's session and the host has presets; shown but not enabled for a
 * chat the person does not own (the host refuses to configure one). A preset
 * naming a Fast tier is not enabled on a host whose `agent.configure` cannot
 * carry one.
 */
export function ChatPresetTabMenu(props: ChatPresetTabMenuProps) {
  const { epicId, chatId, hostId } = props;
  const handle = useExistingChatSessionHandle(epicId, chatId, hostId);
  const hasChat = useSyncExternalStore(
    handle === null ? NO_SUBSCRIBE : handle.store.subscribe,
    () => handle !== null && handle.store.getState().chat !== null,
  );
  const role = useSyncExternalStore(
    handle === null ? NO_SUBSCRIBE : handle.store.subscribe,
    () =>
      handle === null ? null : (handle.store.getState().access?.role ?? null),
  );
  const presets = useAgentPresetsStore((state) =>
    selectHostPresets(state, hostId),
  );
  const groups = useMemo(() => groupPresetsByProject(presets), [presets]);
  const client = useHostClientForHostId(hostId);
  const configure = useAgentConfigure(
    client,
    "Couldn't apply the preset to this agent.",
  );
  const version = useHostMethodSchemaVersion(hostId, "agent.configure");
  if (
    !hasChat ||
    presets.length === 0 ||
    !agentConfigureCarriesRouting(version, null)
  ) {
    return null;
  }
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger
        disabled={role !== "owner" || configure.isPending}
        data-testid="chat-preset-menu"
      >
        <Bookmark className="size-4" />
        Apply preset
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {groups.map(([repoPath, rows]) => (
          <Fragment key={repoPath}>
            <ContextMenuLabel title={repoPath}>
              {presetProjectName(repoPath)}
            </ContextMenuLabel>
            {rows.map((preset) => (
              <ContextMenuItem
                key={preset.id}
                disabled={
                  !agentConfigureCarriesRouting(version, preset.serviceTier)
                }
                data-testid="chat-preset-item"
                onSelect={() => {
                  // `mutateAsync`, not a callback handed to `mutate`: choosing
                  // an item closes the menu, which unmounts this component
                  // before the host answers, and TanStack drops a per-call
                  // callback whose component is gone. The continuation reads
                  // no component state. A refusal is toasted by the hook.
                  void configure
                    .mutateAsync(
                      presetConfigureRequest({ epicId, chatId, preset }),
                    )
                    .then(
                      () => {
                        toast.success(`Applied ${preset.name}.`);
                      },
                      () => undefined,
                    );
                }}
              >
                {preset.name}
              </ContextMenuItem>
            ))}
          </Fragment>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
