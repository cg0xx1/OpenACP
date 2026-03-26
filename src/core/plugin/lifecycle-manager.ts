import { resolveLoadOrder } from './plugin-loader.js'
import { ServiceRegistry } from './service-registry.js'
import { MiddlewareChain } from './middleware-chain.js'
import { ErrorTracker } from './error-tracker.js'
import { createPluginContext } from './plugin-context.js'
import type { OpenACPPlugin, EventBus, Logger, MigrateContext } from './types.js'
import type { SettingsManager } from './settings-manager.js'
import type { PluginRegistry } from './plugin-registry.js'

const SETUP_TIMEOUT_MS = 30_000
const TEARDOWN_TIMEOUT_MS = 10_000

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${label} exceeded ${ms}ms`)), ms)
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      ;(timer as NodeJS.Timeout).unref()
    }
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

function resolvePluginConfig(pluginName: string, configManager: unknown): Record<string, unknown> {
  try {
    const allConfig = (configManager as any)?.get?.() ?? {}
    // Try new format: plugins.builtin['@openacp/speech'].config
    const pluginEntry = allConfig.plugins?.builtin?.[pluginName]
    if (pluginEntry?.config && Object.keys(pluginEntry.config).length > 0) {
      return pluginEntry.config
    }
    // Fallback to legacy config sections
    const legacyMap: Record<string, string> = {
      '@openacp/security': 'security',
      '@openacp/speech': 'speech',
      '@openacp/tunnel': 'tunnel',
      '@openacp/usage': 'usage',
      '@openacp/file-service': 'files',
      '@openacp/api-server': 'api',
      '@openacp/telegram': 'channels.telegram',
      '@openacp/discord': 'channels.discord',
      '@openacp/slack': 'channels.slack',
    }
    const legacyKey = legacyMap[pluginName]
    if (legacyKey) {
      const parts = legacyKey.split('.')
      let obj: any = allConfig
      for (const p of parts) obj = obj?.[p]
      if (obj && typeof obj === 'object') return { ...obj }
    }
  } catch {
    // Gracefully degrade — return empty config
  }
  return {}
}

export interface LifecycleManagerOpts {
  serviceRegistry?: ServiceRegistry
  middlewareChain?: MiddlewareChain
  errorTracker?: ErrorTracker
  eventBus?: EventBus & {
    on(event: string, handler: (...args: unknown[]) => void): void
    off(event: string, handler: (...args: unknown[]) => void): void
    emit(event: string, payload: unknown): void
  }
  storagePath?: string
  sessions?: unknown
  config?: unknown
  core?: unknown
  log?: Logger
  settingsManager?: SettingsManager
  pluginRegistry?: PluginRegistry
}

export class LifecycleManager {
  readonly serviceRegistry: ServiceRegistry
  readonly middlewareChain: MiddlewareChain
  readonly errorTracker: ErrorTracker

  private eventBus: LifecycleManagerOpts['eventBus']
  private storagePath: string
  private sessions: unknown
  private config: unknown
  private core: unknown
  private log: Logger | undefined
  private settingsManager: SettingsManager | undefined
  private pluginRegistry: PluginRegistry | undefined

  private contexts = new Map<string, ReturnType<typeof createPluginContext>>()
  private loadOrder: OpenACPPlugin[] = []
  private _loaded = new Set<string>()
  private _failed = new Set<string>()

  get loadedPlugins(): string[] {
    return [...this._loaded]
  }

  get failedPlugins(): string[] {
    return [...this._failed]
  }

  constructor(opts?: LifecycleManagerOpts) {
    this.serviceRegistry = opts?.serviceRegistry ?? new ServiceRegistry()
    this.middlewareChain = opts?.middlewareChain ?? new MiddlewareChain()
    this.errorTracker = opts?.errorTracker ?? new ErrorTracker()
    this.eventBus = opts?.eventBus ?? {
      on() {},
      off() {},
      emit() {},
    }
    this.storagePath = opts?.storagePath ?? '/tmp/openacp-plugins'
    this.sessions = opts?.sessions ?? {}
    this.config = opts?.config ?? {}
    this.core = opts?.core
    this.log = opts?.log
    this.settingsManager = opts?.settingsManager
    this.pluginRegistry = opts?.pluginRegistry
  }

  async boot(plugins: OpenACPPlugin[]): Promise<void> {
    // Resolve load order via topological sort.
    // resolveLoadOrder will skip plugins whose dependencies are missing entirely
    // (not present in the input list). But we also need to handle runtime setup failures.
    let sorted: OpenACPPlugin[]
    try {
      sorted = resolveLoadOrder(plugins)
    } catch (err) {
      // Circular dependency or other fatal error in resolution
      // Mark all as failed
      for (const p of plugins) {
        this._failed.add(p.name)
      }
      return
    }

    this.loadOrder = sorted

    for (const plugin of sorted) {
      // Check if any required dependency failed at runtime
      if (plugin.pluginDependencies) {
        const depFailed = Object.keys(plugin.pluginDependencies).some(
          (dep) => this._failed.has(dep),
        )
        if (depFailed) {
          this._failed.add(plugin.name)
          continue
        }
      }

      // Check if disabled in registry
      const registryEntry = this.pluginRegistry?.get(plugin.name)
      if (registryEntry && registryEntry.enabled === false) {
        this.eventBus?.emit('plugin:disabled', { name: plugin.name })
        continue
      }

      // Check version mismatch → migrate
      if (registryEntry && plugin.migrate && registryEntry.version !== plugin.version && this.settingsManager) {
        try {
          const oldSettings = await this.settingsManager.loadSettings(plugin.name)
          const migrateCtx: MigrateContext = {
            pluginName: plugin.name,
            settings: this.settingsManager.createAPI(plugin.name),
            log: ((this.log as any)?.child?.({ plugin: plugin.name }) ?? this.log ?? console) as any,
          }
          const newSettings = await plugin.migrate(migrateCtx, oldSettings, registryEntry.version)
          if (newSettings && typeof newSettings === 'object') {
            await migrateCtx.settings.setAll(newSettings as Record<string, unknown>)
          }
          this.pluginRegistry!.updateVersion(plugin.name, plugin.version)
          await this.pluginRegistry!.save()
        } catch (err) {
          const childLog = (this.log as any)?.child?.({ plugin: plugin.name })
          ;(childLog ?? this.log ?? console as any).warn?.({ err }, 'Migration failed, continuing with old settings')
        }
      }

      // Resolve config: prefer settings.json, fallback to legacy
      let pluginConfig: Record<string, unknown>
      if (this.settingsManager) {
        pluginConfig = await this.settingsManager.loadSettings(plugin.name)
        if (Object.keys(pluginConfig).length === 0) {
          pluginConfig = resolvePluginConfig(plugin.name, this.config)
        }
      } else {
        pluginConfig = resolvePluginConfig(plugin.name, this.config)
      }

      // Create context for this plugin
      const ctx = createPluginContext({
        pluginName: plugin.name,
        pluginConfig,
        permissions: plugin.permissions ?? [],
        serviceRegistry: this.serviceRegistry,
        middlewareChain: this.middlewareChain,
        errorTracker: this.errorTracker,
        eventBus: this.eventBus!,
        storagePath: `${this.storagePath}/${plugin.name}`,
        sessions: this.sessions,
        config: this.config,
        core: this.core,
        log: this.log,
      })

      try {
        await withTimeout(plugin.setup(ctx), SETUP_TIMEOUT_MS, `${plugin.name}.setup()`)
        this.contexts.set(plugin.name, ctx)
        this._loaded.add(plugin.name)
        this.eventBus?.emit('plugin:loaded', { name: plugin.name, version: plugin.version })
      } catch (err) {
        this._failed.add(plugin.name)
        ctx.cleanup()
        this.eventBus?.emit('plugin:failed', { name: plugin.name, error: String(err) })
      }
    }
  }

  async shutdown(): Promise<void> {
    // Teardown in reverse load order
    const reversed = [...this.loadOrder].reverse()

    for (const plugin of reversed) {
      if (!this._loaded.has(plugin.name)) continue

      if (plugin.teardown) {
        try {
          await withTimeout(plugin.teardown(), TEARDOWN_TIMEOUT_MS, `${plugin.name}.teardown()`)
        } catch {
          // Swallow teardown errors — graceful shutdown
        }
      }

      // Clean up the context
      const ctx = this.contexts.get(plugin.name)
      if (ctx) {
        ctx.cleanup()
        this.contexts.delete(plugin.name)
      }

      this.eventBus?.emit('plugin:unloaded', { name: plugin.name })
    }

    this._loaded.clear()
    this.loadOrder = []
  }
}
