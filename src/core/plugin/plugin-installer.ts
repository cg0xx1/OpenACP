import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import * as os from 'node:os'
import * as path from 'node:path'

const execAsync = promisify(exec)

/**
 * Install an npm package into the plugins directory.
 * Uses async exec to avoid blocking the event loop.
 */
export async function installNpmPlugin(packageName: string): Promise<void> {
  const pluginsDir = path.join(os.homedir(), '.openacp', 'plugins')
  await execAsync(`npm install ${packageName}`, { cwd: pluginsDir })
}
