# Proposal: Microkernel Lifecycle Architecture for OpenACP

## Status

**Proposal** — this document describes a long-term architectural vision. It is not a spec and not ready for implementation. Feedback and discussion are welcome.

## Context

OpenACP currently has a monolithic architecture where all subsystems (Security, Speech, Usage, Notifications, FileService, Tunnel, etc.) are hard-wired into `OpenACPCore`. The plugin system only supports adding new channel adapters via `AdapterFactory`.

PR #63 proposes Plugin API v2 — a unified plugin interface with events, commands, middleware, and storage. This is a significant step forward but still treats core subsystems as built-in and plugins as extensions on top.

This proposal takes the next step: **what if everything is a plugin?**

### Ongoing work (not blocked by this proposal)

- **Phase 1** — Adapter layer refactor (`refactor/adapter-layer-phase1`), currently in progress
- **Phase 2** — ACP protocol completion, planned after Phase 1
- **PR #63** — Plugin API v2 spec, under review

This proposal builds on top of PR #63 and does not block or conflict with any of the above. PR #63 can be implemented as-is and serves as the foundation for this architecture.

---

## Vision

Transform OpenACP from a monolithic application into a **microkernel** where:

- **Kernel** holds only: Lifecycle management, EventBus, Config, ServiceRegistry, Session management, Agent management
- **Everything else is a plugin**: Adapters, Speech, Usage/Budget, Security, Notifications, Tunnel, Context, FileService, API Server
- **Built-in plugins** ship with OpenACP (no install needed), community plugins are installed separately
- All plugins — built-in and community — follow the same interface, same lifecycle, same rules

### Why microkernel?

The goal is not architectural purity. The goal is:

1. **Any feature can be added without touching core** — community builds what they need
2. **Any built-in can be replaced** — don't like our security model? Swap it
3. **Each piece has clear boundaries** — understand speech by reading one plugin, not tracing through 5 core files
4. **Independent update cycles** — update speech plugin without updating OpenACP itself

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    OpenACP Process                       │
│                                                         │
│  ┌───────────────────────────────────────────────────┐  │
│  │                    Kernel                          │  │
│  │                                                   │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │  │
│  │  │ Lifecycle│ │ EventBus │ │  ServiceRegistry  │ │  │
│  │  │ Manager  │ │          │ │                   │ │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │  │
│  │  ┌──────────┐ ┌──────────┐ ┌───────────────────┐ │  │
│  │  │  Config  │ │ Session  │ │  Agent Manager    │ │  │
│  │  │ Manager  │ │ Manager  │ │                   │ │  │
│  │  └──────────┘ └──────────┘ └───────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────┐ │  │
│  │  │            Plugin Loader                     │ │  │
│  │  └──────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────┘  │
│                          │                              │
│          ┌───────────────┼───────────────┐              │
│          ▼               ▼               ▼              │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────────┐  │
│  │  Built-in    │ │  Built-in  │ │   Community       │  │
│  │  Plugins     │ │  Adapters  │ │   Plugins         │  │
│  │              │ │            │ │                    │  │
│  │ • security   │ │ • telegram │ │ • auto-approve    │  │
│  │ • file-svc   │ │ • discord  │ │ • translate       │  │
│  │ • notify     │ │ • slack    │ │ • custom-adapter  │  │
│  │ • usage      │ │            │ │ • conversation-log│  │
│  │ • speech     │ │            │ │ • ...             │  │
│  │ • context    │ │            │ │                    │  │
│  │ • tunnel     │ │            │ │                    │  │
│  │ • api-server │ │            │ │                    │  │
│  └──────────────┘ └────────────┘ └──────────────────────│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### What stays in the kernel

| Component | Why it's in kernel |
|-----------|-------------------|
| **Lifecycle Manager** | Fundamental — manages boot/shutdown sequence, plugin loading |
| **EventBus** | Fundamental — communication backbone for all plugins |
| **Config Manager** | Must exist before any plugin loads (plugins need config to know if they're enabled) |
| **Service Registry** | Core coordination — plugins register and lookup services |
| **Session Manager** | Too fundamental to externalize — every adapter and most plugins interact with sessions |
| **Agent Manager** | Tightly coupled with sessions — spawning/resuming agent subprocesses is core to OpenACP's purpose |
| **Plugin Loader** | Obviously kernel responsibility — loads and initializes plugins |

### What becomes a plugin

| Current module | Plugin name | Service it provides |
|---------------|-------------|-------------------|
| `SecurityGuard` | `@openacp/plugin-security` | `security` |
| `FileService` | `@openacp/plugin-file-service` | `file-service` |
| `NotificationManager` | `@openacp/plugin-notifications` | `notifications` |
| `UsageStore` + `UsageBudget` | `@openacp/plugin-usage` | `usage` |
| `SpeechService` | `@openacp/plugin-speech` | `speech` |
| `ContextManager` | `@openacp/plugin-context` | `context` |
| Tunnel service | `@openacp/plugin-tunnel` | `tunnel` |
| API server | `@openacp/plugin-api-server` | `api-server` |
| `TelegramAdapter` | `@openacp/plugin-telegram` | `adapter:telegram` |
| `DiscordAdapter` | `@openacp/plugin-discord` | `adapter:discord` |
| `SlackAdapter` | `@openacp/plugin-slack` | `adapter:slack` |

### Project structure

```
src/
  kernel/
    index.ts              — Kernel class, public API
    lifecycle.ts          — Boot/shutdown sequence, plugin loading
    event-bus.ts          — Typed event bus
    config.ts             — Config loading, Zod validation
    service-registry.ts   — Service registration and lookup
    session-manager.ts    — Session state machine, prompt queue
    agent-manager.ts      — Agent spawning, ACP subprocess
    plugin-loader.ts      — Load built-in + community plugins
    plugin-context.ts     — PluginContext factory
    types.ts              — All shared types and interfaces
  plugins/
    built-in/
      security/
        index.ts          — OpenACPPlugin implementation
      file-service/
        index.ts
      notifications/
        index.ts
      usage/
        index.ts
      speech/
        index.ts
      context/
        index.ts
      tunnel/
        index.ts
      api-server/
        index.ts
    adapters/
      telegram/
        index.ts          — OpenACPPlugin + adapter implementation
      discord/
        index.ts
      slack/
        index.ts
```

---

## Plugin Interface

Building on PR #63's `OpenACPPlugin` interface, extended with dependency declaration and service registration:

```typescript
interface OpenACPPlugin {
  /** Unique plugin identifier, e.g., '@openacp/plugin-security' */
  name: string

  /** Semver version */
  version: string

  /** Human-readable description */
  description?: string

  /** Required plugin dependencies — auto-installed on `openacp plugin add` */
  pluginDependencies?: Record<string, string>  // name → semver range

  /** Optional plugin dependencies — used if available, skipped if not */
  optionalPluginDependencies?: Record<string, string>

  /** Required permissions (from PR #63) */
  permissions: PluginPermission[]

  /**
   * Called during startup. Register services, hooks, commands here.
   * Plugins receive a PluginContext with access to kernel capabilities.
   *
   * Called in dependency order — all plugins in `pluginDependencies`
   * are guaranteed to have completed setup() before this plugin's setup().
   */
  setup(ctx: PluginContext): Promise<void>

  /**
   * Called during shutdown. Cleanup resources, flush data, close connections.
   * Called in reverse order of setup.
   * Has a timeout — plugin must complete within the grace period.
   */
  teardown?(): Promise<void>
}
```

### PluginContext

PluginContext follows PR #63's tiered design, extended with service registration and lookup:

```typescript
interface PluginContext {
  // === Identity ===
  /** This plugin's name */
  pluginName: string

  /** Plugin-specific config from config.json */
  pluginConfig: Record<string, unknown>

  // === Tier 1 — Events (read-only, stable) ===
  on(event: PluginEvent, handler: Function): void
  off(event: PluginEvent, handler: Function): void

  // === Tier 2 — Actions (side effects, stable) ===
  registerCommand(def: CommandDef): void
  registerMiddleware(hook: MiddlewareHook, handler: MiddlewareFn): void
  sendMessage(sessionId: string, content: OutgoingMessage): Promise<void>
  storage: PluginStorage
  log: Logger

  // === Tier 2.5 — Services (new in microkernel) ===

  /**
   * Register a service that other plugins can use.
   * Service name must be unique. Built-in plugins register first.
   * Community plugin can override built-in with `overrides` declaration.
   */
  registerService<T>(name: string, implementation: T): void

  /**
   * Lookup a service by name. Returns undefined if not registered.
   * For required dependencies (declared in pluginDependencies),
   * the service is guaranteed to exist.
   * For optional dependencies, always check for undefined.
   */
  getService<T>(name: string): T | undefined

  // === Tier 3 — Kernel access (advanced, may change) ===
  kernel: Kernel
  sessions: SessionManager
  config: ConfigManager  // read-only
  eventBus: EventBus
}
```

---

## Plugin Dependencies

### Declaration

Each plugin declares what other plugins it needs:

```typescript
// @openacp/plugin-speech
{
  name: '@openacp/plugin-speech',
  version: '1.0.0',
  pluginDependencies: {
    '@openacp/plugin-file-service': '^1.0.0'   // MUST be installed and active
  },
  optionalPluginDependencies: {
    '@openacp/plugin-usage': '^1.0.0'          // use if available
  }
}
```

### Install-time resolution

When user runs `openacp plugin add @openacp/plugin-speech`:

1. Fetch plugin from npm
2. Read `pluginDependencies`
3. For each dependency not already installed → auto-install recursively
4. `optionalPluginDependencies` → print suggestion, don't auto-install
5. Add all to `~/.openacp/config.json` plugins array

```
$ openacp plugin add @openacp/plugin-speech

📦 @openacp/plugin-speech v1.0.0
   Text-to-speech and speech-to-text for voice sessions

   Required dependencies:
   ✅ @openacp/plugin-file-service v1.2.0 (already installed)
   📦 @openacp/plugin-groq-provider v1.0.0 (will be installed)

   Optional dependencies:
   💡 @openacp/plugin-usage v1.0.0 (not installed — usage tracking for speech calls)

   Permissions:
   ✅ events:read          — Listen to session events
   ✅ services:register    — Register speech service
   ✅ services:use         — Use file-service

   Install? [Y/n]
```

### Startup-time resolution

Kernel resolves plugin load order using topological sort on the dependency graph:

```
Given plugins:
  security        → (no deps)
  file-service    → (no deps)
  notifications   → security
  usage           → (no deps)
  speech          → file-service
  telegram        → security, notifications
  auto-approve    → security (community plugin)

Topo-sort result:
  1. security, file-service, usage     (no deps — can start in parallel)
  2. notifications, speech             (deps satisfied)
  3. telegram, auto-approve            (deps satisfied)
```

Plugins at the same depth in the graph CAN be started in parallel (future optimization, sequential for v1).

### Circular dependency detection

```
Plugin A depends on Plugin B
Plugin B depends on Plugin A
→ Detected at startup, before any setup() is called
→ Error: "Circular dependency detected: A → B → A. Cannot start."
→ Both plugins are skipped, rest of system boots normally
```

### Missing dependency handling

```
Plugin telegram depends on security
Security plugin is not installed or disabled
→ Error: "@openacp/plugin-telegram requires @openacp/plugin-security which is not available"
→ telegram plugin skipped
→ Rest of system boots normally (degraded — no telegram)
```

### Version mismatch

```
Plugin speech requires file-service ^1.0.0
Installed file-service is 2.0.0
→ Warning: "@openacp/plugin-speech requires @openacp/plugin-file-service ^1.0.0 but 2.0.0 is installed"
→ Attempt to load anyway (warning, not error)
→ If setup() fails → skip plugin with error
```

---

## Plugin Communication

Two patterns, each with a clear use case:

### Pattern 1: EventBus — for broadcast / notifications

When a plugin needs to announce something happened, without knowing or caring who listens:

```typescript
// Kernel emits lifecycle events
kernel.eventBus.emit('session:created', { sessionId, agentName })

// Multiple plugins listen independently
// Usage plugin:
ctx.on('session:created', ({ sessionId }) => {
  this.startTracking(sessionId)
})

// Notifications plugin:
ctx.on('session:created', ({ sessionId, agentName }) => {
  this.notify(`New session started: ${agentName}`)
})

// Conversation-log plugin:
ctx.on('session:created', ({ sessionId }) => {
  this.createLogFile(sessionId)
})
```

**Use for:** Lifecycle events, agent events, status changes, audit logging.

**Not for:** Request/response patterns where caller needs a return value.

### Pattern 2: Service lookup — for direct calls

When a plugin needs to call another plugin's functionality and get a result:

```typescript
// Telegram adapter needs to convert text to speech
async handleVoiceMode(sessionId: string, text: string) {
  const speech = ctx.getService<SpeechService>('speech')
  if (!speech) {
    // Speech plugin not installed — fallback to text only
    await this.sendTextMessage(sessionId, text)
    return
  }

  const audio = await speech.textToSpeech(text, { language: 'en' })
  await this.sendAudioMessage(sessionId, audio)
}
```

```typescript
// Auto-approve plugin needs to check security rules
async handlePermissionRequest(sessionId: string, request: PermissionRequest) {
  const security = ctx.getService<SecurityService>('security')

  // security is a required dependency — guaranteed to exist
  const userRole = await security.getUserRole(request.userId)

  if (userRole === 'admin' && request.kind === 'read') {
    // Auto-approve reads for admins
    ctx.kernel.resolvePermission(sessionId, request.id, 'allow-once')
  }
}
```

**Use for:** Getting data from another plugin, calling another plugin's functionality, request/response patterns.

**Not for:** One-way notifications (use EventBus instead).

### When to use which?

| Scenario | Pattern | Why |
|----------|---------|-----|
| "Session just started" | EventBus | Broadcast — anyone can listen |
| "Convert this text to audio" | Service lookup | Need return value |
| "Agent produced output" | EventBus | Multiple consumers (log, send, track) |
| "Check if user is allowed" | Service lookup | Need yes/no answer |
| "Plugin encountered error" | EventBus | Broadcast — monitoring plugins listen |
| "Store this file to disk" | Service lookup | Need file path back |

---

## Startup Lifecycle

### Boot sequence

```
1. Kernel boot
   ├── Load config from ~/.openacp/config.json
   ├── Init logger
   ├── Init EventBus
   ├── Init ServiceRegistry
   ├── Init SessionManager
   ├── Init AgentManager
   └── Emit 'kernel:booted'

2. Plugin discovery
   ├── Scan built-in plugins (from source)
   ├── Scan community plugins (from ~/.openacp/plugins/)
   ├── Read each plugin's dependencies
   ├── Validate: check for missing deps, circular deps, version mismatches
   └── Compute load order via topological sort

3. Plugin setup (in topo-sorted order)
   ├── For each plugin:
   │   ├── Create PluginContext (scoped by permissions)
   │   ├── Call plugin.setup(ctx)
   │   ├── If setup() throws → log error, mark plugin as failed, continue
   │   ├── Register services declared by plugin
   │   └── Emit 'plugin:loaded' event
   └── If a plugin's required dependency failed → skip this plugin too

4. Post-setup validation
   ├── Check all registered services are healthy
   ├── Check all adapters are ready
   └── Warn about any optional dependencies not satisfied

5. Ready
   ├── Emit 'system:ready'
   ├── Adapters start accepting messages
   └── Log startup summary (loaded plugins, skipped plugins, warnings)
```

### Shutdown sequence

```
1. Receive SIGINT/SIGTERM
   └── Emit 'system:shutdown' event

2. Grace period begins (default: 30 seconds)
   ├── Adapters stop accepting new messages
   ├── Active sessions are notified ("OpenACP is shutting down")
   └── Wait for in-flight prompts to complete (up to grace period)

3. Plugin teardown (reverse order of setup)
   ├── For each plugin (reverse topo-sort order):
   │   ├── Call plugin.teardown() with timeout (10 seconds per plugin)
   │   ├── If teardown() times out → log warning, force continue
   │   ├── If teardown() throws → log error, continue
   │   └── Emit 'plugin:unloaded' event
   └── Adapters teardown last (they were set up last)

4. Kernel cleanup
   ├── Destroy all remaining sessions
   ├── Stop AgentManager (kill subprocesses)
   ├── Flush EventBus
   ├── Save config/state
   └── Exit process
```

### Startup example — concrete

Given this config:

```json
{
  "plugins": [
    { "package": "@openacp/plugin-security", "enabled": true },
    { "package": "@openacp/plugin-file-service", "enabled": true },
    { "package": "@openacp/plugin-notifications", "enabled": true },
    { "package": "@openacp/plugin-usage", "enabled": true },
    { "package": "@openacp/plugin-speech", "enabled": true },
    { "package": "@openacp/plugin-tunnel", "enabled": false },
    { "package": "@openacp/plugin-api-server", "enabled": true },
    { "package": "@openacp/plugin-telegram", "enabled": true },
    { "package": "@community/plugin-auto-approve", "enabled": true }
  ]
}
```

Boot log:

```
[kernel] OpenACP v3.0.0 starting...
[kernel] Config loaded from ~/.openacp/config.json
[kernel] EventBus initialized
[kernel] SessionManager initialized
[kernel] AgentManager initialized
[kernel] Discovered 9 plugins (8 enabled, 1 disabled)
[kernel] Plugin load order (topo-sorted):
         1. security, file-service, usage (no deps)
         2. notifications (→ security)
         3. speech (→ file-service)
         4. api-server (→ security)
         5. telegram (→ security, notifications)
         6. auto-approve (→ security)
[kernel] Skipping tunnel (disabled)
[plugin:security] Setting up... registered service 'security'
[plugin:file-service] Setting up... registered service 'file-service'
[plugin:usage] Setting up... registered service 'usage'
[plugin:notifications] Setting up... registered service 'notifications'
[plugin:speech] Setting up... registered service 'speech'
[plugin:api-server] Setting up... API server listening on :3000
[plugin:telegram] Setting up... connected to Telegram Bot API
[plugin:auto-approve] Setting up... auto-approve rules loaded
[kernel] All plugins loaded. System ready.
[kernel] Accepting messages on: telegram
```

---

## Service Registration & Conflict Resolution

### Registration rules

```typescript
// Plugin registers a service during setup()
ctx.registerService('security', {
  checkAccess(userId: string): Promise<boolean> { ... },
  getUserRole(userId: string): Promise<string> { ... }
})
```

**Rule 1: One service per name.** If two plugins try to register the same service name, the behavior depends on plugin type:

| Scenario | Behavior |
|----------|----------|
| Two built-in plugins register same name | **Startup error** — this is a bug in OpenACP, fix it |
| Community plugin registers name already taken by built-in | **Error** unless plugin declares `overrides` |
| Community plugin with `overrides` declaration | Built-in is skipped, community plugin takes over |
| Two community plugins register same name | **Startup error** — user must choose one |

**Rule 2: Override declaration.**

```typescript
// Community plugin that replaces built-in security
{
  name: '@company/plugin-custom-security',
  version: '1.0.0',
  overrides: '@openacp/plugin-security',  // explicit declaration
  permissions: ['services:register'],

  async setup(ctx) {
    ctx.registerService('security', {
      // custom implementation
    })
  }
}
```

When a plugin declares `overrides`, the kernel:
1. Loads the overriding plugin instead of the overridden one
2. The overridden plugin's `setup()` is never called
3. Log: "Plugin @company/plugin-custom-security overrides @openacp/plugin-security"

**Rule 3: Service interface compliance.** The kernel does NOT enforce service interfaces at runtime (TypeScript types are erased). This means a community override could register an incomplete implementation. Mitigation:
- Built-in plugins serve as reference implementation
- Plugin SDK provides interface types for TypeScript users
- Runtime failures are caught by error isolation (try/catch per call)

### Service lookup semantics

```typescript
// Required dependency — guaranteed to exist after setup()
const security = ctx.getService<SecurityService>('security')
// security is never undefined here because pluginDependencies guarantees it

// Optional dependency — may not exist
const speech = ctx.getService<SpeechService>('speech')
if (speech) {
  // speech plugin is installed and active
}

// Unknown service — always returns undefined
const foo = ctx.getService('nonexistent')
// foo === undefined
```

---

## Built-in vs Community Plugins

### Built-in plugins

Ships with OpenACP source code. Loaded from `src/plugins/`:

```typescript
// Kernel loads built-in plugins directly
import securityPlugin from './plugins/built-in/security/index.js'
import fileServicePlugin from './plugins/built-in/file-service/index.js'
// ...

const builtInPlugins = [
  securityPlugin,
  fileServicePlugin,
  notificationsPlugin,
  usagePlugin,
  speechPlugin,
  contextPlugin,
  tunnelPlugin,
  apiServerPlugin,
  telegramPlugin,
  discordPlugin,
  slackPlugin,
]
```

**Properties:**
- Always available — no install step
- Trusted — no permission consent prompt, no checksum verification
- Same repo — updated together with kernel, never version-mismatched
- Can use optimized fast paths (kernel can skip overhead for trusted plugins)
- Serve as **reference implementations** for community plugin authors

### Community plugins

Installed via `openacp plugin add`, stored in `~/.openacp/plugins/`:

```
~/.openacp/plugins/
  ├── package.json
  ├── node_modules/
  │   └── @community/plugin-auto-approve/
  │       ├── package.json
  │       └── dist/index.js
  ├── data/
  │   └── auto-approve/
  │       └── storage.json
  └── checksums.json
```

**Properties:**
- Must be installed explicitly
- Permission consent required at install time (from PR #63's security model)
- Checksum verified at startup
- Error-isolated (from PR #63's error isolation)
- Can override built-in plugins (with explicit declaration)

### How built-in plugins are disabled

User can disable a built-in plugin in config:

```json
{
  "plugins": [
    { "package": "@openacp/plugin-speech", "enabled": false }
  ]
}
```

When disabled:
- Plugin's `setup()` is never called
- Service is not registered
- Other plugins that optionally depend on it gracefully degrade
- Other plugins that require it → skip with error

---

## Concrete Plugin Examples

### Example 1: Security plugin (built-in)

```typescript
import type { OpenACPPlugin, PluginContext } from '@openacp/kernel'

const securityPlugin: OpenACPPlugin = {
  name: '@openacp/plugin-security',
  version: '1.0.0',
  description: 'User access control, rate limiting, session concurrency limits',
  pluginDependencies: {},
  permissions: ['events:read', 'services:register'],

  async setup(ctx: PluginContext) {
    const config = ctx.pluginConfig as SecurityConfig
    const allowedUsers = new Set(config.allowedUserIds ?? [])
    const maxSessions = config.maxConcurrentSessions ?? 5

    const activeSessions = new Map<string, number>() // userId → count

    // Track session lifecycle for concurrency limits
    ctx.on('session:created', ({ sessionId, userId }) => {
      const count = activeSessions.get(userId) ?? 0
      activeSessions.set(userId, count + 1)
    })

    ctx.on('session:ended', ({ sessionId, userId }) => {
      const count = activeSessions.get(userId) ?? 1
      activeSessions.set(userId, Math.max(0, count - 1))
    })

    // Register security service
    ctx.registerService('security', {
      async checkAccess(userId: string): Promise<{ allowed: boolean; reason?: string }> {
        // No allowlist = allow everyone
        if (allowedUsers.size === 0) return { allowed: true }
        if (!allowedUsers.has(userId)) {
          return { allowed: false, reason: 'User not in allowed list' }
        }
        return { allowed: true }
      },

      async checkSessionLimit(userId: string): Promise<{ allowed: boolean; reason?: string }> {
        const count = activeSessions.get(userId) ?? 0
        if (count >= maxSessions) {
          return { allowed: false, reason: `Session limit reached (${maxSessions})` }
        }
        return { allowed: true }
      },

      async getUserRole(userId: string): Promise<'admin' | 'user' | 'blocked'> {
        if (!allowedUsers.has(userId) && allowedUsers.size > 0) return 'blocked'
        if (config.adminUserIds?.includes(userId)) return 'admin'
        return 'user'
      }
    })

    ctx.log.info(`Security initialized: ${allowedUsers.size} allowed users, max ${maxSessions} sessions`)
  },

  async teardown() {
    // Nothing to clean up
  }
}

export default securityPlugin
```

### Example 2: Telegram adapter plugin (built-in)

```typescript
import type { OpenACPPlugin, PluginContext } from '@openacp/kernel'

const telegramPlugin: OpenACPPlugin = {
  name: '@openacp/plugin-telegram',
  version: '1.0.0',
  description: 'Telegram adapter using grammY with forum topics',
  pluginDependencies: {
    '@openacp/plugin-security': '^1.0.0',
    '@openacp/plugin-notifications': '^1.0.0',
  },
  optionalPluginDependencies: {
    '@openacp/plugin-speech': '^1.0.0',
  },
  permissions: ['events:read', 'services:register', 'services:use', 'commands:register'],

  async setup(ctx: PluginContext) {
    const config = ctx.pluginConfig as TelegramConfig
    const security = ctx.getService<SecurityService>('security')!    // required — guaranteed
    const speech = ctx.getService<SpeechService>('speech')            // optional — may be undefined

    const bot = new Bot(config.botToken)

    // Check access on every message
    bot.on('message:text', async (botCtx) => {
      const userId = String(botCtx.from.id)
      const access = await security.checkAccess(userId)
      if (!access.allowed) {
        await botCtx.reply(`Access denied: ${access.reason}`)
        return
      }

      // Route to session...
    })

    // Voice messages — only if speech plugin is available
    if (speech) {
      bot.on('message:voice', async (botCtx) => {
        const audio = await botCtx.getFile()
        const text = await speech.speechToText(audio)
        // Route transcribed text to session...
      })
    }

    // Listen for outgoing messages from kernel
    ctx.on('agent:event', async ({ sessionId, event }) => {
      // Format and send to Telegram topic...
    })

    // Register adapter service
    ctx.registerService('adapter:telegram', {
      sendMessage: async (sessionId, content) => { /* ... */ },
      createTopic: async (sessionId, name) => { /* ... */ },
      // ...
    })

    await bot.start()
    ctx.log.info('Telegram adapter connected')
  },

  async teardown() {
    await this.bot?.stop()
  }
}

export default telegramPlugin
```

### Example 3: Auto-approve plugin (community)

```typescript
import type { OpenACPPlugin } from '@openacp/cli'

export default {
  name: '@community/plugin-auto-approve',
  version: '1.0.0',
  description: 'Auto-approve read operations, require manual approval for writes',
  pluginDependencies: {
    '@openacp/plugin-security': '^1.0.0'
  },
  permissions: ['events:read', 'services:use', 'commands:register', 'storage:write'],

  async setup(ctx) {
    const security = ctx.getService<SecurityService>('security')!
    const rules = await ctx.storage.get<ApproveRules>('rules') ?? {
      approveReads: true,
      approveSearches: true,
      approveWritesForAdmins: false,
    }

    ctx.on('permission:request', async ({ sessionId, request }) => {
      const userRole = await security.getUserRole(request.userId)

      let autoApprove = false

      if (rules.approveReads && request.kind === 'read') {
        autoApprove = true
      }
      if (rules.approveSearches && request.kind === 'search') {
        autoApprove = true
      }
      if (rules.approveWritesForAdmins && userRole === 'admin' && request.kind === 'write') {
        autoApprove = true
      }

      if (autoApprove) {
        ctx.kernel.resolvePermission(sessionId, request.id, 'allow-once')
        ctx.log.debug(`Auto-approved ${request.kind} for ${request.userId}`)
      }
    })

    ctx.registerCommand({
      name: 'autoapprove',
      description: 'Configure auto-approve rules',
      usage: '<on|off|status|config>',
      async handler({ raw, reply }) {
        const arg = raw.trim().toLowerCase()

        if (arg === 'status') {
          const lines = Object.entries(rules)
            .map(([k, v]) => `  ${k}: ${v ? 'on' : 'off'}`)
            .join('\n')
          await reply(`Auto-approve rules:\n${lines}`)
          return
        }

        if (arg === 'off') {
          rules.approveReads = false
          rules.approveSearches = false
          rules.approveWritesForAdmins = false
          await ctx.storage.set('rules', rules)
          await reply('Auto-approve disabled for all operations')
          return
        }

        if (arg === 'on') {
          rules.approveReads = true
          rules.approveSearches = true
          await ctx.storage.set('rules', rules)
          await reply('Auto-approve enabled for reads and searches')
          return
        }

        await reply('Usage: /autoapprove <on|off|status>')
      }
    })
  }
} satisfies OpenACPPlugin
```

### Example 4: Message translation plugin (community)

Shows middleware usage and optional dependency on speech:

```typescript
import type { OpenACPPlugin } from '@openacp/cli'

export default {
  name: '@community/plugin-translate',
  version: '1.0.0',
  description: 'Real-time message translation between user and agent',
  pluginDependencies: {},
  optionalPluginDependencies: {
    '@openacp/plugin-speech': '^1.0.0'  // translate voice messages too
  },
  permissions: ['events:read', 'commands:register', 'middleware:register', 'storage:write'],

  async setup(ctx) {
    const speech = ctx.getService<SpeechService>('speech')  // optional

    // Per-session translation settings
    // key: sessionId, value: { from: 'vi', to: 'en' }
    const sessionLangs = new Map<string, { from: string; to: string }>()

    // Middleware: translate user prompt before sending to agent
    ctx.registerMiddleware('before:prompt', async (sessionId, text, attachments) => {
      const langs = sessionLangs.get(sessionId)
      if (!langs) return { text, attachments }

      const translated = await translateText(text, langs.from, langs.to)
      return { text: translated, attachments }
    })

    // Middleware: translate agent response before sending to user
    ctx.registerMiddleware('after:response', async (sessionId, message) => {
      const langs = sessionLangs.get(sessionId)
      if (!langs || message.type !== 'text') return message

      const translated = await translateText(message.text, langs.to, langs.from)
      return { ...message, text: translated }
    })

    // Clean up when session ends
    ctx.on('session:ended', ({ sessionId }) => {
      sessionLangs.delete(sessionId)
    })

    ctx.registerCommand({
      name: 'translate',
      description: 'Enable translation for this session',
      usage: '<from-lang> <to-lang> | off',
      async handler({ sessionId, raw, reply }) {
        if (!sessionId) {
          await reply('This command must be used in a session')
          return
        }

        if (raw.trim() === 'off') {
          sessionLangs.delete(sessionId)
          await reply('Translation disabled')
          return
        }

        const [from, to] = raw.trim().split(/\s+/)
        if (!from || !to) {
          await reply('Usage: /translate vi en')
          return
        }

        sessionLangs.set(sessionId, { from, to })
        await reply(`Translating: ${from} ↔ ${to}`)
      }
    })
  }
} satisfies OpenACPPlugin
```

---

## Edge Cases & Failure Scenarios

### Edge Case 1: Plugin setup() fails

```
Scenario: Speech plugin's setup() throws because Groq API key is invalid.

Kernel behavior:
1. Catch error, log: "Plugin @openacp/plugin-speech setup failed: Invalid API key"
2. Mark plugin as 'failed'
3. Service 'speech' is never registered
4. Continue loading other plugins
5. Telegram adapter (optional dep on speech) → boots normally, voice features disabled
6. If any plugin has REQUIRED dep on speech → that plugin also skipped
```

**Cascading failure:**
```
speech fails → speech-dependent plugin A also skipped →
plugin B depends on A → plugin B also skipped → ...

Kernel logs the full cascade:
  "Skipping @openacp/plugin-telegram-voice: required dependency @openacp/plugin-speech failed"
```

### Edge Case 2: Plugin teardown() hangs

```
Scenario: Telegram adapter teardown() hangs because Telegram API is unreachable.

Kernel behavior:
1. Call teardown() with 10-second timeout
2. After 10 seconds: "Plugin @openacp/plugin-telegram teardown timed out (10s), forcing continue"
3. Move to next plugin's teardown
4. After all plugins done, kernel force-kills remaining resources

No plugin can block shutdown indefinitely.
```

### Edge Case 3: Plugin event handler throws repeatedly

```
Scenario: Community plugin has bug, throws on every 'agent:event'.

Kernel behavior (error budget from PR #63):
1. First few errors: catch, log, continue
2. After 10 errors in 60 seconds:
   "Plugin @community/plugin-buggy auto-disabled due to repeated errors"
3. Plugin's event listeners are removed
4. Plugin's services remain registered (other plugins may depend on them)
   but service calls will also be wrapped in try/catch
5. Plugin can be re-enabled with: openacp plugin enable @community/plugin-buggy
```

### Edge Case 4: Two community plugins register same service

```
Scenario:
  @community/plugin-security-v1 registers service 'security'
  @community/plugin-security-v2 registers service 'security'
  Neither declares 'overrides'

Kernel behavior:
1. First plugin (by config order) registers 'security' successfully
2. Second plugin calls registerService('security', ...)
   → Error: "Service 'security' already registered by @community/plugin-security-v1"
3. Second plugin's setup() receives the error
4. If second plugin doesn't handle it → setup fails → plugin skipped

Resolution for user:
- Remove one of the two plugins
- Or: move preferred plugin first in config array and have the other declare 'overrides'
```

### Edge Case 5: Community plugin overrides built-in with incomplete implementation

```
Scenario:
  @company/custom-security overrides @openacp/plugin-security
  But custom-security only implements checkAccess(), not getUserRole()

Runtime behavior:
1. Telegram adapter calls security.getUserRole(userId)
2. getUserRole is undefined → TypeError
3. Error caught by service call wrapper:
   "Service 'security' method 'getUserRole' is not a function
    (provided by @company/custom-security, overriding @openacp/plugin-security)"
4. Caller handles error gracefully (adapter-specific fallback)

Prevention:
- Plugin SDK exports interface types → TypeScript catches at compile time
- Built-in plugin serves as reference → community authors know what to implement
```

### Edge Case 6: Plugin dependency installed but wrong version

```
Scenario:
  Plugin A requires '@openacp/plugin-file-service' ^1.0.0
  Installed file-service is 2.0.0 (breaking changes)

Startup behavior:
1. Version check: "^1.0.0 does not match 2.0.0"
2. Warning logged (not error — don't block, because it might work)
3. Plugin A's setup() is called
4. If A uses removed API from v1 → setup() fails → A is skipped
5. If A only uses APIs that still exist in v2 → works fine

This is the npm peerDependencies approach — warn, don't block.
```

### Edge Case 7: Circular optional dependencies

```
Scenario:
  Plugin A optionally depends on Plugin B
  Plugin B optionally depends on Plugin A

Behavior:
  Optional dependencies are NOT included in topo-sort.
  Only required dependencies affect load order.

  Kernel loads A first (or B, based on config order).
  When A does getService('B') → undefined (B not loaded yet).
  When B loads, B does getService('A') → found (A already loaded).

  This asymmetry is expected with optional deps. Plugin authors
  must handle getService() returning undefined for optional deps.
```

### Edge Case 8: Plugin modifies shared state via Tier 3 access

```
Scenario:
  Community plugin with 'core:access' permission does:
    ctx.kernel.sessionManager.destroyAll()

Behavior:
  This is valid — Tier 3 grants full access. This is by design.
  The permission consent at install time warns the user:

  "⚠️ WARNING: This plugin requests Tier 3 access (core:access).
   It can access all core services including session management."

Prevention:
  - Don't install plugins with core:access unless you trust them
  - PR #63's security model handles this with trust levels
  - Future: audit logging for Tier 3 calls
```

### Edge Case 9: Hot-reload (future) — plugin update while sessions active

```
Scenario (future feature, not in v1):
  User runs: openacp plugin update @openacp/plugin-speech
  While 3 sessions are actively using speech service.

Expected behavior:
  1. Old speech plugin teardown() is called
  2. Active speech calls in-flight complete or timeout
  3. New speech plugin is loaded and setup() called
  4. Service 'speech' is re-registered with new implementation
  5. Next speech call uses new plugin

Risk:
  - In-flight calls may fail during transition window
  - State in old plugin is lost (unless migrated via storage)

v1 approach: Don't support hot-reload. Restart to update plugins.
```

### Edge Case 10: Built-in plugin disabled but required by community plugin

```
Scenario:
  User disables @openacp/plugin-security in config
  Community plugin @community/auto-approve requires security

Startup behavior:
  1. Kernel sees security is disabled → skip it
  2. Service 'security' is never registered
  3. auto-approve requires security → dependency check fails
  4. "Skipping @community/plugin-auto-approve: required dependency
      @openacp/plugin-security is disabled"
  5. System boots without both plugins

User fix:
  - Re-enable security plugin
  - Or remove auto-approve plugin
```

---

## Pros & Cons Summary

### Pros

| Benefit | Detail |
|---------|--------|
| **Community extensibility** | Anyone can build features without core PRs. Auto-approve, translation, custom adapters, conversation logging — all possible as plugins. |
| **Replaceable components** | Don't like built-in security? Write your own. Want S3 file storage instead of local? Plugin. Corporate SSO? Plugin. |
| **Clear boundaries** | Each plugin is self-contained. Understand speech by reading one plugin directory, not tracing through 5 core files. |
| **Independent updates** | Update speech plugin without updating all of OpenACP. Rollback one plugin without rollback everything. |
| **Testing isolation** | Test each plugin independently. Mock kernel + services for unit tests. No more testing the entire monolith for a speech change. |
| **Onboarding** | New contributor wants to add a feature → write a plugin. Don't need to understand entire core codebase. |
| **Configuration flexibility** | Disable unused features (speech, tunnel, api-server) to reduce attack surface and resource usage. |
| **Forced clean architecture** | Plugin boundaries force clean interfaces. No more "just import this internal class" shortcuts. |

### Cons

| Drawback | Detail | Mitigation |
|----------|--------|------------|
| **Contract stability pressure** | Kernel API changes break community plugins. Must semver carefully. | Built-in plugins as canary — if they work after API change, community plugins likely work too. Deprecation warnings before removal. |
| **Debug complexity** | Stack traces cross plugin boundaries, go through EventBus, ServiceRegistry. Harder to follow than monolith. | Structured logging per plugin, event tracing, correlation IDs per request. |
| **Performance overhead** | EventBus broadcast + try/catch per handler + service lookup. More hops per message. | Negligible for OpenACP's message-rate workload. Benchmark streaming path. Fast path for built-in plugins. |
| **Startup time** | More plugins to load, dependency graph to resolve. ~2-3x slower than monolith. | Still under 5 seconds. Built-in loaded from source (fast). Parallel setup for independent plugins (future). |
| **Learning curve** | Plugin authors need to understand: PluginContext API, service registration, dependency declaration, permissions. | Good documentation, example plugins, plugin SDK with TypeScript types, `openacp plugin create` scaffolding tool. |
| **Initial development cost** | Significant refactor: kernel extraction, plugin interface, built-in plugin migration, testing. | Doesn't block current work (Phase 1, Phase 2). Can be done incrementally. |
| **Over-engineering risk** | For a project with 1-2 maintainers, full microkernel may be premature. All "plugins" are maintained by same team initially. | Built-in plugins reduce this — day-to-day development feels similar to monolith. Architecture pays off when community grows. |
| **Implicit coupling through services** | Plugin A calls `getService('security').checkAccess()` — this is coupling, just not import-level. Change security's API → break A at runtime, not compile time. | TypeScript interfaces in plugin SDK catch at compile time. Runtime errors caught by error isolation. |
| **State management complexity** | Each plugin has isolated storage. Cross-plugin state queries require going through services or events. No shared database. | By design — isolation prevents plugins from depending on each other's internal state. Services expose what's needed. |
| **Versioning matrix** | With independent plugin versions, need to track compatibility: kernel v3 + security v1.2 + speech v2.0 — does this combination work? | Semver ranges in pluginDependencies. CI matrix testing for official plugins. Community plugins declare which kernel version they support. |

---

## Relationship to PR #63 and Current Work

### What we take from PR #63

| PR #63 concept | How it's used here |
|----------------|-------------------|
| `OpenACPPlugin` interface | Extended with `pluginDependencies`, `optionalPluginDependencies`, `overrides` |
| `PluginContext` tiered API | Extended with `registerService()`, `getService()` |
| Permission model (Tier 1/2/3) | Used as-is, with `services:register` and `services:use` added |
| Error isolation | Used as-is (try/catch per handler, error budget) |
| Plugin storage | Used as-is |
| Command registration | Used as-is |
| Middleware hooks | Used as-is |
| Security model (consent, checksums, trust levels) | Used as-is for community plugins, skipped for built-in |
| Backward compatibility (v1 AdapterFactory) | Used as-is |

### What this proposal adds beyond PR #63

| New concept | Purpose |
|-------------|---------|
| **Kernel extraction** | Core split into minimal kernel + plugins |
| **Built-in plugins** | Ship with OpenACP, same interface as community |
| **Service registry** | Plugins register and lookup services by name |
| **Plugin dependencies** | `pluginDependencies` with auto-install + topo-sort |
| **Service override** | Community plugin can replace built-in via `overrides` |
| **Dependency-based startup order** | Topo-sort replaces manual config ordering |
| **Graceful shutdown with timeout** | Per-plugin teardown timeout, grace period for in-flight work |

### Migration path

```
Current state (monolith)
  │
  ▼
Phase 1: Adapter layer refactor (in progress)
  │
  ▼
Phase 2: ACP protocol completion (planned)
  │
  ▼
PR #63: Plugin API v2 (adds plugin system on top of monolith)
  │
  ▼
This proposal: Microkernel (extract kernel, migrate subsystems to plugins)
```

Each step is independently valuable. This proposal does not require starting from scratch — it builds on all previous work.

---

## Open Questions

1. **Should Session and Agent management stay in kernel forever, or eventually become plugins too?** Current decision: keep in kernel (Mức 3). May revisit if use cases emerge that need replacing them.

2. **Plugin config schema validation** — should plugins be able to declare a Zod schema for their config section? This would give users better error messages at startup.

3. **Plugin-to-plugin events** — should plugins be able to emit custom events on the EventBus, or only kernel-defined events? Custom events increase flexibility but reduce discoverability.

4. **Built-in plugin packaging** — should built-in plugins be publishable as separate npm packages too? This would let users pin specific versions of built-in plugins independently from kernel.

5. **Monitoring/observability** — should the kernel provide a standard health check interface that plugins implement? e.g., `healthCheck(): Promise<{ status: 'ok' | 'degraded' | 'error', details: string }>`.

---

## Next Steps

This is a proposal for discussion. Concrete next steps after alignment:

1. Write detailed implementation spec (from this proposal)
2. Create implementation plan with concrete PRs
3. Implement kernel extraction
4. Migrate built-in subsystems to plugins one by one
5. Update documentation and plugin SDK
