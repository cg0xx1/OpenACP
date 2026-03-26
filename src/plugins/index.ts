import contextPlugin from './context/index.js'
import speechPlugin from './speech/index.js'
import usagePlugin from './usage/index.js'
import tunnelPlugin from './tunnel/index.js'
import securityPlugin from './security/index.js'
import notificationsPlugin from './notifications/index.js'
import fileServicePlugin from './file-service/index.js'

export const builtInPlugins = [
  securityPlugin,
  contextPlugin,
  speechPlugin,
  usagePlugin,
  tunnelPlugin,
  notificationsPlugin,
  fileServicePlugin,
]
