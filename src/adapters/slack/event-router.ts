// src/adapters/slack/event-router.ts
import type { App } from "@slack/bolt";
import type { SlackSessionMeta, SlackFileInfo } from "./types.js";
import type { SlackChannelConfig } from "./types.js";
import { createChildLogger } from "../../core/log.js";
const log = createChildLogger({ module: "slack-event-router" });

// Callback to look up which session (if any) owns a Slack channelId
export type SessionLookup = (channelId: string) => SlackSessionMeta | undefined;

// Callback to dispatch an incoming message to core
export type IncomingMessageCallback = (sessionId: string, text: string, userId: string, files?: SlackFileInfo[]) => void;

// Callback to create a new session when user messages the notification channel
export type NewSessionCallback = (text: string, userId: string) => void;

export interface ISlackEventRouter {
  register(app: App): void;
}

export class SlackEventRouter implements ISlackEventRouter {
  constructor(
    private sessionLookup: SessionLookup,
    private onIncoming: IncomingMessageCallback,
    private botUserId: string,
    private notificationChannelId: string | undefined,
    private onNewSession: NewSessionCallback,
    private config: SlackChannelConfig,
  ) {}

  private isAllowedUser(userId: string): boolean {
    const allowed = this.config.allowedUserIds ?? [];
    if (allowed.length === 0) return true;
    return allowed.includes(userId);
  }

  register(app: App): void {
    app.message(async ({ message }) => {
      log.debug({ message }, "Slack raw message event");

      // Ignore bot messages (including our own)
      if ((message as any).bot_id) return;
      const subtype = (message as any).subtype;
      if (subtype && subtype !== "file_share") return;  // edited, deleted, etc.

      const channelId = (message as any).channel as string;
      const text: string = (message as any).text ?? "";
      const userId: string = (message as any).user ?? "";

      const files: SlackFileInfo[] | undefined = (message as any).files?.map((f: any) => ({
        id: f.id,
        name: f.name,
        mimetype: f.mimetype,
        size: f.size,
        url_private: f.url_private,
      }));

      log.debug({ channelId, userId, text }, "Slack message received");

      // Ignore messages from the bot itself
      if (userId === this.botUserId) return;

      // Enforce allowedUserIds
      if (!this.isAllowedUser(userId)) {
        log.warn({ userId }, "slack: message from non-allowed user rejected");
        return;
      }

      const session = this.sessionLookup(channelId);
      if (session) {
        // Message to an existing session channel
        log.debug({ channelId, sessionSlug: session.channelSlug }, "Routing to session");
        this.onIncoming(session.channelSlug, text, userId, files);
        return;
      }

      log.debug({ channelId, notificationChannelId: this.notificationChannelId }, "No session found for channel");

      // Message to the notification channel → create new session
      if (this.notificationChannelId && channelId === this.notificationChannelId) {
        this.onNewSession(text, userId);
        return;
      }
    });
  }
}
