import type { CommandRegistry } from '../command-registry.js'
import type { CommandResponse } from '../plugin/types.js'

export function registerSwitchCommands(registry: CommandRegistry): void {
  registry.register({
    name: 'switch',
    description: 'Switch to a different agent',
    usage: '[agent-name | label on|off]',
    category: 'system',
    handler: async (args) => {
      const raw = args.raw.trim()

      // /switch label on|off
      if (raw.startsWith('label ')) {
        const value = raw.slice(6).trim().toLowerCase()
        if (value !== 'on' && value !== 'off') {
          return { type: 'error', message: 'Usage: /switch label on|off' } satisfies CommandResponse
        }
        return { type: 'silent' } satisfies CommandResponse
      }

      // /switch (no args) → show menu, or /switch <agent> → direct switch
      // Both delegated to adapter handler
      return { type: 'silent' } satisfies CommandResponse
    },
  })
}
