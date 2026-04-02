import { isJsonMode, jsonSuccess } from '../output.js'

export async function cmdVersion(args: string[] = []): Promise<void> {
  const { getCurrentVersion } = await import('../version.js')
  const version = getCurrentVersion()

  if (isJsonMode(args)) {
    jsonSuccess({ version })
  }

  console.log(`openacp v${version}`)
}
