import type { OpenACPPlugin } from '../../core/plugin/types.js'
import type { OpenACPCore } from '../../core/core.js'
import type { TelegramChannelConfig } from '../../adapters/telegram/types.js'

function createTelegramPlugin(): OpenACPPlugin {
  let adapter: { stop(): Promise<void> } | null = null

  return {
    name: '@openacp/telegram',
    version: '1.0.0',
    description: 'Telegram adapter with forum topics',
    pluginDependencies: {
      '@openacp/security': '^1.0.0',
      '@openacp/notifications': '^1.0.0',
    },
    optionalPluginDependencies: {
      '@openacp/speech': '^1.0.0',
    },
    permissions: ['services:register', 'kernel:access', 'events:read'],

    async setup(ctx) {
      const config = ctx.pluginConfig as Record<string, unknown>
      if (!config.botToken || !config.chatId) {
        ctx.log.info('Telegram disabled (missing botToken or chatId)')
        return
      }

      const { TelegramAdapter } = await import('../../adapters/telegram/adapter.js')
      // config is a Record<string, unknown> from pluginConfig; at runtime it
      // contains all TelegramChannelConfig fields populated from the migrated config.
      adapter = new TelegramAdapter(ctx.core as OpenACPCore, {
        ...config,
        enabled: true,
        maxMessageLength: 4096,
      } as unknown as TelegramChannelConfig)

      ctx.registerService('adapter:telegram', adapter)
      ctx.log.info('Telegram adapter registered')
    },

    async teardown() {
      if (adapter) {
        await adapter.stop()
      }
    },
  }
}

export default createTelegramPlugin()
