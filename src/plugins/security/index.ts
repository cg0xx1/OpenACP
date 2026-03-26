import type { OpenACPPlugin } from '../../core/plugin/types.js'
import { SecurityGuard } from './security-guard.js'

// Factory function pattern (closure for state)
function createSecurityPlugin(): OpenACPPlugin {
  return {
    name: '@openacp/security',
    version: '1.0.0',
    description: 'User access control and session limits',
    permissions: ['services:register', 'middleware:register', 'kernel:access'],

    async setup(ctx) {
      const core = ctx.core as any
      const guard = new SecurityGuard(core.configManager, core.sessionManager)

      // Register middleware for message:incoming — block unauthorized users
      ctx.registerMiddleware('message:incoming', {
        handler: async (payload: any, next) => {
          const access = guard.checkAccess(payload)
          if (!access.allowed) {
            ctx.log.info(`Access denied: ${access.reason}`)
            return null  // block
          }
          return next()
        }
      })

      // Register SecurityGuard as the service directly
      ctx.registerService('security', guard)
      ctx.log.info('Security service ready')
    },
  }
}

export default createSecurityPlugin()
