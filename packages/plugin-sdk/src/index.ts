// ============================================================
// @openacp/plugin-sdk — main entry point
//
// Sub-path imports available:
//   @openacp/plugin-sdk/formatting — format utils, icons
//   @openacp/plugin-sdk/config     — config utils, doctor engine
//   @openacp/plugin-sdk/testing    — test helpers, conformance tests
// ============================================================

// --- @stable: Plugin interfaces ---
export type {
  OpenACPPlugin, PluginContext, PluginPermission, PluginStorage,
  InstallContext, MigrateContext, TerminalIO, SettingsAPI,
} from '@openacp/cli'

// --- @stable: Command types ---
export type {
  CommandDef, CommandArgs, CommandResponse, MenuOption, ListItem,
} from '@openacp/cli'

// --- @stable: Service interfaces ---
export type {
  SecurityService, FileServiceInterface, NotificationService,
  UsageService, SpeechServiceInterface, TunnelServiceInterface, ContextService,
} from '@openacp/cli'

// --- @stable: Adapter types ---
export type {
  IChannelAdapter, AdapterCapabilities, OutgoingMessage, PermissionRequest,
  PermissionOption, NotificationMessage, AgentCommand,
} from '@openacp/cli'

// --- @stable: Adapter base classes ---
export { MessagingAdapter, StreamAdapter, BaseRenderer } from '@openacp/cli'
export type { MessagingAdapterConfig, IRenderer, RenderedMessage } from '@openacp/cli'

// --- @stable: Adapter primitives ---
export { SendQueue, DraftManager, ToolCallTracker, ActivityTracker } from '@openacp/cli'

// --- @stable: Formatting (also available via @openacp/plugin-sdk/formatting) ---
export type { DisplayVerbosity, ToolCallMeta, ToolUpdateMeta, ViewerLinks } from '@openacp/cli'
export { STATUS_ICONS, KIND_ICONS } from '@openacp/cli'
export { progressBar, formatTokens, truncateContent, stripCodeFences, splitMessage } from '@openacp/cli'
export { extractContentText, formatToolSummary, formatToolTitle, resolveToolIcon } from '@openacp/cli'

// --- @stable: Core classes ---
export { OpenACPCore } from '@openacp/cli'
export { Session } from '@openacp/cli'
export type { SessionEvents } from '@openacp/cli'
export { SessionManager } from '@openacp/cli'
export { CommandRegistry } from '@openacp/cli'

// --- @experimental: Config utilities (also via @openacp/plugin-sdk/config) ---
export { DoctorEngine } from '@openacp/cli'
export type { DoctorReport, PendingFix } from '@openacp/cli'
export type { ConfigFieldDef } from '@openacp/cli'
export { getSafeFields, resolveOptions, getConfigValue, isHotReloadable } from '@openacp/cli'

// --- @stable: Logging ---
export { log, createChildLogger } from '@openacp/cli'

// --- @stable: Data ---
export { PRODUCT_GUIDE } from '@openacp/cli'

// --- @stable: Core types ---
export type {
  Attachment, PlanEntry, StopReason, SessionStatus, ConfigOption,
  UsageRecord, InstallProgress,
  DiscordPlatformData, TelegramPlatformData,
} from '@openacp/cli'
