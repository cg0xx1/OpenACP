// Plugin interfaces
export type {
  OpenACPPlugin, PluginContext, PluginPermission, PluginStorage,
  InstallContext, MigrateContext, TerminalIO, SettingsAPI,
} from '@openacp/cli'

// Command types
export type {
  CommandDef, CommandArgs, CommandResponse, MenuOption, ListItem,
} from '@openacp/cli'

// Service interfaces
export type {
  SecurityService, FileServiceInterface, NotificationService,
  UsageService, SpeechServiceInterface, TunnelServiceInterface, ContextService,
} from '@openacp/cli'

// Adapter types
export type {
  IChannelAdapter, AdapterCapabilities, OutgoingMessage, PermissionRequest,
  PermissionOption, NotificationMessage, AgentCommand,
} from '@openacp/cli'

// Adapter base classes
export { MessagingAdapter, StreamAdapter, BaseRenderer } from '@openacp/cli'
export type { MessagingAdapterConfig, IRenderer, RenderedMessage } from '@openacp/cli'

// Adapter primitives
export { SendQueue, DraftManager, ToolCallTracker, ActivityTracker } from '@openacp/cli'

// Format types & constants
export type { DisplayVerbosity, ToolCallMeta, ToolUpdateMeta, ViewerLinks } from '@openacp/cli'
export { STATUS_ICONS, KIND_ICONS } from '@openacp/cli'

// Format utilities
export { progressBar, formatTokens, truncateContent, stripCodeFences, splitMessage } from '@openacp/cli'
export { extractContentText, formatToolSummary, formatToolTitle, resolveToolIcon } from '@openacp/cli'

// Core classes
export { OpenACPCore } from '@openacp/cli'
export { Session } from '@openacp/cli'
export type { SessionEvents } from '@openacp/cli'
export { SessionManager } from '@openacp/cli'
export { CommandRegistry } from '@openacp/cli'

// Doctor system
export { DoctorEngine } from '@openacp/cli'
export type { DoctorReport, PendingFix } from '@openacp/cli'

// Config utilities
export type { ConfigFieldDef } from '@openacp/cli'
export { getSafeFields, resolveOptions, getConfigValue, isHotReloadable } from '@openacp/cli'

// Logging
export { log, createChildLogger } from '@openacp/cli'

// Data
export { PRODUCT_GUIDE } from '@openacp/cli'

// Core types
export type {
  Attachment, PlanEntry, StopReason, SessionStatus, ConfigOption,
  UsageRecord, UsageSummary, InstallProgress,
  DiscordPlatformData, TelegramPlatformData,
} from '@openacp/cli'
