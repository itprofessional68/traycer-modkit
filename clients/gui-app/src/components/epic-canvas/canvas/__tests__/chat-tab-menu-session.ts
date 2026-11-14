import type { ChatRunSettings } from "@traycer/protocol/persistence/epic/schemas";
import { chatRecordSchema } from "@traycer/protocol/host/agent/gui/subscribe-windowed";
import { getChatSessionRegistry } from "@/lib/registries/chat-session-registry";
import { createChatSessionStore } from "@/stores/chats/chat-session-store";
import { IMMEDIATE_STREAM_FLUSH_COORDINATOR } from "@/stores/chats/stream-flush-coordinator";
import { CHAT_STORE_TEST_ENVIRONMENT } from "@/stores/chats/test-support/chat-store-test-environment";

/** The record of chat `chat-1` in `epic-1` on `host-1`, as the host sends it. */
export const CHAT_RECORD = {
  id: "chat-1",
  parentId: null,
  userId: "user-1",
  hostId: "host-1",
  title: "A chat",
  createdAt: 1,
  updatedAt: 1,
  isTitleEditedByUser: false,
  settings: null,
  activeSessionChain: null,
  claudePendingWakes: [],
  messages: [],
  events: [],
  archivedAt: null,
  pinnedUserProviderHandle: null,
  lastDeliveredRolesDigest: null,
};

/**
 * A chat session for `chat-1` the way a chat tab's tile holds it, over a
 * stream that goes nowhere, for the tab menu's per-chat entries.
 */
export function openChatTabSession(
  role: "owner" | "viewer",
  settings: ChatRunSettings,
): void {
  const handle = getChatSessionRegistry().acquire(
    {
      epicId: "epic-1",
      chatId: "chat-1",
      hostId: "host-1",
      scopeKey: "chat-tab-menu",
    },
    () =>
      createChatSessionStore({
        environment: CHAT_STORE_TEST_ENVIRONMENT,
        hostId: "host-1",
        epicId: "epic-1",
        chatId: "chat-1",
        userId: "user-1",
        onAuthError: null,
        onProviderAuthError: null,
        wakeTransport: null,
        streamFlushCoordinator: IMMEDIATE_STREAM_FLUSH_COORDINATOR,
        streamClientFactory: () => ({
          sendAction: () => undefined,
          sameTurnSteeringProtocolSupported: () => true,
          draftBlobBridgeSupported: () => true,
          requestTranscriptRange: () => undefined,
          requestResnapshot: () => undefined,
          close: () => undefined,
        }),
      }),
  );
  handle.store.setState({
    chat: chatRecordSchema.parse({ ...CHAT_RECORD, settings }),
    access: { role, ownerUserId: "user-1", canAct: role === "owner" },
  });
}
