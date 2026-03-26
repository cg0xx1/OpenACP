import type { OpenACPPlugin } from '../../core/plugin/types.js'
import type { OpenACPCore } from '../../core/core.js'
import type { ApiConfig } from '../../core/api/index.js'

function createApiServerPlugin(): OpenACPPlugin {
  let server: { start(): Promise<void>; stop?(): Promise<void> } | null = null

  return {
    name: '@openacp/api-server',
    version: '1.0.0',
    description: 'REST API + SSE streaming server',
    permissions: ['services:register', 'kernel:access', 'events:read'],

    async setup(ctx) {
      const config = ctx.pluginConfig as Record<string, unknown>

      // Lazy import to avoid loading unless needed
      const { ApiServer } = await import('../../core/api/index.js')

      const apiConfig: ApiConfig = {
        port: (config.port as number) ?? 0,
        host: (config.host as string) ?? '127.0.0.1',
      }

      server = new ApiServer(ctx.core as OpenACPCore, apiConfig)

      ctx.registerService('api-server', server)

      // Start on system:ready
      ctx.on('system:ready', async () => {
        try {
          await server!.start()
          ctx.log.info('API server started')
        } catch (err) {
          ctx.log.error(`API server failed to start: ${err}`)
        }
      })
    },

    async teardown() {
      if (server) {
        await server.stop?.()
      }
    },
  }
}

export default createApiServerPlugin()
