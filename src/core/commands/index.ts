import type { CommandRegistry } from '../command-registry.js'
import { registerSessionCommands } from './session.js'
import { registerAgentCommands } from './agents.js'
import { registerAdminCommands } from './admin.js'
import { registerHelpCommand } from './help.js'
import { registerMenuCommand } from './menu.js'
import { registerSwitchCommands } from './switch.js'

export function registerSystemCommands(registry: CommandRegistry, core: unknown): void {
  registerSessionCommands(registry, core)
  registerAgentCommands(registry, core)
  registerAdminCommands(registry, core)
  registerHelpCommand(registry, core)
  registerMenuCommand(registry, core)
  registerSwitchCommands(registry)
}
