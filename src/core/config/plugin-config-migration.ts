type RawConfig = Record<string, unknown>

interface PluginEntry {
  config: Record<string, unknown>
  enabled?: boolean
}

interface MigratedConfig extends RawConfig {
  plugins: {
    builtin: Record<string, PluginEntry>
  }
}

/**
 * Check if config needs migration to plugin-based format.
 * Returns true if the `plugins` field is missing.
 */
export function needsMigration(config: RawConfig): boolean {
  return !('plugins' in config) || config.plugins === undefined
}

/**
 * Helper: migrate a channel sub-key from channels.{name} to plugins.builtin.
 * Extracts `enabled` into the PluginEntry level; rest goes into `config`.
 */
function migrateChannel(
  channels: Record<string, unknown> | undefined,
  channelKey: string,
  pluginName: string,
  builtin: Record<string, PluginEntry>,
): void {
  if (!channels || typeof channels !== 'object') return
  const channelConfig = channels[channelKey] as Record<string, unknown> | undefined
  if (channelConfig && typeof channelConfig === 'object') {
    const { enabled, ...rest } = channelConfig
    builtin[pluginName] = {
      config: rest as Record<string, unknown>,
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
    }
  }
}

/**
 * Helper: migrate a top-level config section to plugins.builtin.
 */
function migrateSection(
  config: RawConfig,
  sectionKey: string,
  pluginName: string,
  builtin: Record<string, PluginEntry>,
): void {
  const section = config[sectionKey] as Record<string, unknown> | undefined
  if (section && typeof section === 'object') {
    builtin[pluginName] = {
      config: { ...section },
    }
  }
}

/**
 * Migrate old flat config format to new plugin-based structure.
 *
 * Maps:
 *   channels.telegram → plugins.builtin['@openacp/telegram']
 *   channels.discord  → plugins.builtin['@openacp/discord']
 *   channels.slack    → plugins.builtin['@openacp/slack']
 *   security          → plugins.builtin['@openacp/security']
 *   speech            → plugins.builtin['@openacp/speech']
 *   tunnel            → plugins.builtin['@openacp/tunnel']
 *   usage             → plugins.builtin['@openacp/usage']
 *   api               → plugins.builtin['@openacp/api-server']
 *
 * Preserves top-level fields (defaultAgent, workingDirectory, debug, etc.).
 * Idempotent: already-migrated configs pass through unchanged.
 */
export function migrateConfig(config: RawConfig): MigratedConfig {
  // Already migrated — return as-is
  if (!needsMigration(config)) {
    return config as MigratedConfig
  }

  const builtin: Record<string, PluginEntry> = {}

  // Migrate channel adapters
  const channels = config.channels as Record<string, unknown> | undefined
  migrateChannel(channels, 'telegram', '@openacp/telegram', builtin)
  migrateChannel(channels, 'discord', '@openacp/discord', builtin)
  migrateChannel(channels, 'slack', '@openacp/slack', builtin)

  // Migrate top-level sections
  migrateSection(config, 'security', '@openacp/security', builtin)
  migrateSection(config, 'speech', '@openacp/speech', builtin)
  migrateSection(config, 'tunnel', '@openacp/tunnel', builtin)
  migrateSection(config, 'usage', '@openacp/usage', builtin)
  migrateSection(config, 'api', '@openacp/api-server', builtin)

  // Build result: preserve top-level fields, remove migrated sections, add plugins
  const {
    channels: _channels,
    security: _security,
    speech: _speech,
    tunnel: _tunnel,
    usage: _usage,
    api: _api,
    ...rest
  } = config

  return {
    ...rest,
    plugins: { builtin },
  }
}
