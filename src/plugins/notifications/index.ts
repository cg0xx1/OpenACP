import type { OpenACPPlugin } from '../../core/plugin/types.js'
import { NotificationManager } from '../../core/notification.js'

function createNotificationsPlugin(): OpenACPPlugin {
  return {
    name: '@openacp/notifications',
    version: '1.0.0',
    description: 'Cross-session notification routing',
    pluginDependencies: { '@openacp/security': '^1.0.0' },
    permissions: ['services:register', 'kernel:access'],

    async setup(ctx) {
      // NotificationManager needs the live adapters Map from core
      const core = ctx.core as { adapters: Map<string, unknown> }
      const manager = new NotificationManager(core.adapters as any)
      ctx.registerService('notifications', manager)
      ctx.log.info('Notifications service ready')
    },
  }
}

export default createNotificationsPlugin()
