import type { OpenACPPlugin } from '../../core/plugin/types.js'
import { FileService } from '../../core/utils/file-service.js'
import path from 'node:path'
import os from 'node:os'

function createFileServicePlugin(): OpenACPPlugin {
  return {
    name: '@openacp/file-service',
    version: '1.0.0',
    description: 'File storage and management for session attachments',
    permissions: ['services:register'],

    async setup(ctx) {
      const config = ctx.pluginConfig as Record<string, unknown>
      const baseDir = (config.baseDir as string) ?? path.join(os.homedir(), '.openacp', 'files')
      const service = new FileService(baseDir)
      ctx.registerService('file-service', service)
      ctx.log.info('File service ready')
    },
  }
}

export default createFileServicePlugin()
