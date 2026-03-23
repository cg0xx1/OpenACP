// src/adapters/slack/types.ts
export type { SlackChannelConfig } from "../../core/config.js";

// Per-session metadata stored in SessionRecord.platform
export interface SlackSessionMeta {
  channelId: string;     // Slack channel ID for this session (C...)
  channelSlug: string;   // e.g. "openacp-fix-auth-bug-a3k9"
}
