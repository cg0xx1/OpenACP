import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { ConfigManager, expandHome } from '../core/config/config.js'

describe('expandHome', () => {
  it('expands ~ to home directory', () => {
    const result = expandHome('~/test')
    expect(result).toBe(path.join(os.homedir(), 'test'))
  })

  it('does not modify absolute paths', () => {
    expect(expandHome('/absolute/path')).toBe('/absolute/path')
  })

  it('does not modify relative paths', () => {
    expect(expandHome('relative/path')).toBe('relative/path')
  })

  it('expands ~ at the start only', () => {
    const result = expandHome('~/Documents/code')
    expect(result).toBe(path.join(os.homedir(), 'Documents/code'))
  })
})

describe('ConfigManager.resolveWorkspace', () => {
  let configManager: ConfigManager
  let tmpDir: string
  let instanceRoot: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-test-'))
    // Simulate instance: tmpDir/.openacp/config.json → workspace = tmpDir/
    instanceRoot = tmpDir
    const dotOpenacp = path.join(instanceRoot, '.openacp')
    fs.mkdirSync(dotOpenacp, { recursive: true })
    const configPath = path.join(dotOpenacp, 'config.json')
    process.env.OPENACP_CONFIG_PATH = configPath

    // Write a valid config (no baseDir — derived from configPath)
    const config = {
      defaultAgent: 'claude',
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))

    configManager = new ConfigManager()
  })

  afterEach(() => {
    delete process.env.OPENACP_CONFIG_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('resolves to instance root (parent of .openacp/) when no input', async () => {
    await configManager.load()
    const result = configManager.resolveWorkspace()
    expect(result).toBe(instanceRoot)
    expect(fs.existsSync(result)).toBe(true)
  })

  it('allows absolute path outside workspace base when allowExternalWorkspaces is true (default)', async () => {
    await configManager.load()
    // /tmp exists on all systems; with allowExternalWorkspaces: true (default) it should be accepted
    const result = configManager.resolveWorkspace('/tmp')
    expect(result).toBe('/tmp')
  })

  it('rejects absolute path outside workspace base when allowExternalWorkspaces is false', async () => {
    // Write config with allowExternalWorkspaces: false
    const configPath = path.join(instanceRoot, '.openacp', 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      defaultAgent: 'claude',
      workspace: { allowExternalWorkspaces: false },
    }, null, 2))
    const restrictedManager = new ConfigManager(configPath)
    await restrictedManager.load()
    expect(() => restrictedManager.resolveWorkspace('/tmp/outside-workspace')).toThrow(/outside base directory/)
  })

  it('rejects tilde path outside workspace base when allowExternalWorkspaces is false', async () => {
    const configPath = path.join(instanceRoot, '.openacp', 'config.json')
    fs.writeFileSync(configPath, JSON.stringify({
      defaultAgent: 'claude',
      workspace: { allowExternalWorkspaces: false },
    }, null, 2))
    const restrictedManager = new ConfigManager(configPath)
    await restrictedManager.load()
    expect(() => restrictedManager.resolveWorkspace('~/outside-workspace-openacp-test')).toThrow(/outside base directory/)
  })

  it('allows absolute path under workspace base', async () => {
    await configManager.load()
    const underBase = path.join(instanceRoot, 'sub-project')
    const result = configManager.resolveWorkspace(underBase)
    expect(result).toBe(underBase)
    expect(fs.existsSync(result)).toBe(true)
  })

  it('allows workspace base itself as absolute path', async () => {
    await configManager.load()
    const result = configManager.resolveWorkspace(instanceRoot)
    expect(result).toBe(instanceRoot)
    expect(fs.existsSync(result)).toBe(true)
  })

  it('resolves named workspace under workspace base', async () => {
    await configManager.load()
    const result = configManager.resolveWorkspace('MyProject')
    expect(result).toBe(path.join(instanceRoot, 'myproject'))
    expect(fs.existsSync(result)).toBe(true)
  })

  it('lowercases named workspace', async () => {
    await configManager.load()
    const result = configManager.resolveWorkspace('MyProject')
    expect(result).toContain('myproject')
    expect(result).not.toContain('MyProject')
  })

  it('creates directories recursively', async () => {
    await configManager.load()
    const result = configManager.resolveWorkspace()
    expect(fs.existsSync(result)).toBe(true)
  })
})

describe('ConfigManager.applyEnvOverrides', () => {
  let tmpDir: string

  function createConfigAndManager(config: Record<string, unknown>): ConfigManager {
    const dotOpenacp = path.join(tmpDir, '.openacp')
    fs.mkdirSync(dotOpenacp, { recursive: true })
    const configPath = path.join(dotOpenacp, 'config.json')
    process.env.OPENACP_CONFIG_PATH = configPath
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    return new ConfigManager()
  }

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-env-test-'))
  })

  afterEach(() => {
    delete process.env.OPENACP_CONFIG_PATH
    delete process.env.OPENACP_DEFAULT_AGENT
    delete process.env.OPENACP_RUN_MODE
    delete process.env.OPENACP_LOG_LEVEL
    delete process.env.OPENACP_LOG_DIR
    delete process.env.OPENACP_DEBUG
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  const baseConfig = {
    defaultAgent: 'claude',
  }

  it('overrides defaultAgent from env', async () => {
    process.env.OPENACP_DEFAULT_AGENT = 'codex'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().defaultAgent).toBe('codex')
  })

  it('overrides runMode from env', async () => {
    process.env.OPENACP_RUN_MODE = 'daemon'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().runMode).toBe('daemon')
  })

  it('overrides log level from env', async () => {
    process.env.OPENACP_LOG_LEVEL = 'debug'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().logging.level).toBe('debug')
  })

  it('overrides log dir from env', async () => {
    process.env.OPENACP_LOG_DIR = '/tmp/custom-logs'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().logging.logDir).toBe('/tmp/custom-logs')
  })

  it('OPENACP_DEBUG sets log level to debug when OPENACP_LOG_LEVEL not set', async () => {
    process.env.OPENACP_DEBUG = '1'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().logging.level).toBe('debug')
  })

  it('OPENACP_DEBUG does NOT override explicit OPENACP_LOG_LEVEL', async () => {
    process.env.OPENACP_DEBUG = '1'
    process.env.OPENACP_LOG_LEVEL = 'warn'
    const manager = createConfigAndManager(baseConfig)
    await manager.load()
    expect(manager.get().logging.level).toBe('warn')
  })
})

describe('ConfigManager.save and hot-reload', () => {
  let configManager: ConfigManager
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openacp-save-test-'))
    const dotOpenacp = path.join(tmpDir, '.openacp')
    fs.mkdirSync(dotOpenacp, { recursive: true })
    const configPath = path.join(dotOpenacp, 'config.json')
    process.env.OPENACP_CONFIG_PATH = configPath

    const config = {
      defaultAgent: 'claude',
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    configManager = new ConfigManager()
    await configManager.load()
  })

  afterEach(() => {
    delete process.env.OPENACP_CONFIG_PATH
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('saves updates and persists to disk', async () => {
    await configManager.save({ defaultAgent: 'codex' })
    expect(configManager.get().defaultAgent).toBe('codex')

    // Verify on disk
    const raw = JSON.parse(fs.readFileSync(path.join(tmpDir, '.openacp', 'config.json'), 'utf-8'))
    expect(raw.defaultAgent).toBe('codex')
  })

  it('emits config:changed event with path and value', async () => {
    const events: any[] = []
    configManager.on('config:changed', (e) => events.push(e))

    await configManager.save(
      { defaultAgent: 'codex' },
      'defaultAgent',
    )

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      path: 'defaultAgent',
      value: 'codex',
    })
  })

  it('does not emit event when changePath not provided', async () => {
    const events: any[] = []
    configManager.on('config:changed', (e) => events.push(e))

    await configManager.save({ defaultAgent: 'codex' })

    expect(events).toHaveLength(0)
  })

  it('deep merges nested config', async () => {
    await configManager.save({ workspace: { allowExternalWorkspaces: false } })
    // Workspace fields should reflect the update
    expect(configManager.get().workspace.allowExternalWorkspaces).toBe(false)
  })
})
