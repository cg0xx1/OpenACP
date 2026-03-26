import type { OpenACPPlugin, CoreAccess } from '../../core/plugin/types.js'
import { NotificationManager } from './notification.js'

function createNotificationsPlugin(): OpenACPPlugin {
  return {
    name: '@openacp/notifications',
    version: '1.0.0',
    description: 'Cross-session notification routing',
    pluginDependencies: { '@openacp/security': '^1.0.0' },
    permissions: ['services:register', 'kernel:access'],

    async setup(ctx) {
      // NotificationManager needs the live adapters Map from core
      const core = ctx.core as CoreAccess
      const manager = new NotificationManager(core.adapters)
      ctx.registerService('notifications', manager)
      ctx.log.info('Notifications service ready')
    },
  }
}

export default createNotificationsPlugin()
