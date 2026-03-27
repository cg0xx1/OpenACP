import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

const execAsync = promisify(exec)

/**
 * Import a package resolved from a specific directory (not the project root).
 * Uses createRequire to resolve from the pluginsDir/node_modules.
 */
export function importFromDir(packageName: string, dir: string): Promise<any> {
  const require = createRequire(path.join(dir, 'node_modules', '_placeholder.js'))
  const resolved = require.resolve(packageName)
  return import(pathToFileURL(resolved).href)
}

/**
 * Install an npm package to the plugins directory and return the loaded module.
 * Tries to import first; if not installed, runs npm install asynchronously.
 */
export async function installNpmPlugin(packageName: string, pluginsDir?: string): Promise<any> {
  const dir = pluginsDir ?? path.join(os.homedir(), '.openacp', 'plugins')

  // Try import from plugins dir first — already installed
  try {
    return await importFromDir(packageName, dir)
  } catch {
    // Not installed, proceed with install
  }

  await execAsync(`npm install ${packageName} --prefix "${dir}" --save`, {
    timeout: 60000,
  })

  return await importFromDir(packageName, dir)
}
