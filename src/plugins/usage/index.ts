import { nanoid } from 'nanoid'
import type { OpenACPPlugin, InstallContext, NotificationService } from '../../core/plugin/types.js'
import type { UsageRecordEvent, UsageRecord } from '../../core/types.js'
import { UsageStore } from './usage-store.js'
import { UsageBudget } from './usage-budget.js'
import type { UsagePluginConfig } from './usage-budget.js'

function createUsagePlugin(): OpenACPPlugin {
  let store: UsageStore | undefined

  return {
    name: '@openacp/usage',
    version: '1.0.0',
    description: 'Token usage tracking and budget enforcement',
    essential: false,
    optionalPluginDependencies: { '@openacp/notifications': '^1.0.0' },
    permissions: [
      'events:read',
      'services:register',
      'services:use',
      'commands:register',
      'storage:read',
      'storage:write',
    ],

    async setup(ctx) {
      const config: UsagePluginConfig = {
        monthlyBudget: (ctx.pluginConfig.monthlyBudget as number | undefined) ?? 0,
        warningThreshold: (ctx.pluginConfig.warningThreshold as number | undefined) ?? 0.8,
        retentionDays: (ctx.pluginConfig.retentionDays as number | undefined) ?? 90,
      }

      store = new UsageStore(ctx.storage)
      const budget = new UsageBudget(store, config)

      // Load existing records into memory cache
      await store.loadFromStorage()

      // Clean old records on startup
      await store.cleanupExpired(config.retentionDays ?? 90)

      // Listen to usage events from core
      ctx.on('usage:recorded', ((...args: unknown[]) => {
        const record = args[0] as UsageRecordEvent
        const usageRecord: UsageRecord = {
          id: nanoid(),
          sessionId: record.sessionId,
          agentName: record.agentName,
          timestamp: record.timestamp,
          tokensUsed: record.tokensUsed,
          contextSize: record.contextSize,
          cost: record.cost,
        }

        void (async () => {
          await store!.append(usageRecord)

          const result = budget.check()
          if (result.message) {
            const notifications = ctx.getService<NotificationService>('notifications')
            if (notifications) {
              await notifications.notifyAll({
                sessionId: record.sessionId,
                type: 'budget_warning',
                summary: result.message,
              })
            }
          }
        })()
      }) as (...args: unknown[]) => void)

      // Register /usage command
      ctx.registerCommand({
        name: 'usage',
        description: 'Show usage summary for current month',
        category: 'plugin',
        handler: async () => {
          const status = budget.getStatus()
          const lines = [
            'Usage (this month):',
            `  Spent: $${status.used.toFixed(2)}`,
            `  Budget: ${status.budget > 0 ? `$${status.budget.toFixed(2)}` : 'not set'}`,
            `  Status: ${status.status} (${status.percent}%)`,
          ]
          return { type: 'text' as const, text: lines.join('\n') }
        },
      })

      // Expose service for other plugins
      ctx.registerService('usage', { store, budget })

      ctx.log.info('Usage tracking ready')
    },

    async teardown() {
      if (store) {
        await store.flush()
        store.destroy()
      }
    },

    async install(ctx: InstallContext) {
      const budget = await ctx.terminal.text({
        message: 'Monthly budget in USD (0 = no limit):',
        defaultValue: '0',
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 0) return 'Must be a non-negative number'
          return undefined
        },
      })

      const threshold = await ctx.terminal.text({
        message: 'Warning threshold (0-1, e.g. 0.8 = warn at 80%):',
        defaultValue: '0.8',
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 0 || n > 1) return 'Must be between 0 and 1'
          return undefined
        },
      })

      const retention = await ctx.terminal.text({
        message: 'Retention days:',
        defaultValue: '90',
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 1) return 'Must be a positive number'
          return undefined
        },
      })

      await ctx.settings.setAll({
        monthlyBudget: Number(budget.trim()),
        warningThreshold: Number(threshold.trim()),
        retentionDays: Number(retention.trim()),
      })

      ctx.terminal.log.success('Usage plugin configured')
    },

    async configure(ctx: InstallContext) {
      const current = await ctx.settings.getAll()

      const budget = await ctx.terminal.text({
        message: 'Monthly budget in USD (0 = no limit):',
        defaultValue: String(current.monthlyBudget ?? 0),
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 0) return 'Must be a non-negative number'
          return undefined
        },
      })

      const threshold = await ctx.terminal.text({
        message: 'Warning threshold (0-1, e.g. 0.8 = warn at 80%):',
        defaultValue: String(current.warningThreshold ?? 0.8),
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 0 || n > 1) return 'Must be between 0 and 1'
          return undefined
        },
      })

      const retention = await ctx.terminal.text({
        message: 'Retention days:',
        defaultValue: String(current.retentionDays ?? 90),
        validate: (v) => {
          const n = Number(v.trim())
          if (isNaN(n) || n < 1) return 'Must be a positive number'
          return undefined
        },
      })

      await ctx.settings.setAll({
        monthlyBudget: Number(budget.trim()),
        warningThreshold: Number(threshold.trim()),
        retentionDays: Number(retention.trim()),
      })

      ctx.terminal.log.success('Usage plugin configured')
    },

    async uninstall(ctx: InstallContext, opts: { purge: boolean }) {
      if (opts.purge) {
        await ctx.settings.clear()
      }
      ctx.terminal.log.success('Usage plugin removed')
    },
  }
}

export default createUsagePlugin()
