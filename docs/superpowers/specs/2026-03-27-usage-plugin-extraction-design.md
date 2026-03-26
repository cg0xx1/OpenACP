# Usage Plugin Extraction Design

**Date:** 2026-03-27
**Status:** Draft
**Goal:** Extract usage tracking from core into a fully standalone plugin (`built-in-plugins/usage-plugin`), removing all usage-related code from core.

## Decisions

| Question | Decision |
|----------|----------|
| Plugin ownership | Plugin owns everything — core has zero usage knowledge |
| Storage | Plugin manages own storage via `ctx.storage` API, no legacy `usage.json` |
| Event source | Core emits `usage:recorded` on event bus; plugin listens |
| Notifications | Plugin emits `notification:send` event; notifications plugin delivers |

## Architecture

```
Core (SessionFactory)            Event Bus               Usage Plugin
─────────────────────           ─────────               ────────────
agent_event (type=usage) ──→  emit('usage:recorded')  ──→ on('usage:recorded')
                                                           │
                                                           ├─ store via ctx.storage
                                                           ├─ check budget
                                                           │
                                                           └─ emit('notification:send') ──→ Notifications Plugin
```

## Plugin Permissions

```typescript
permissions: ['events:read', 'events:emit', 'services:register', 'commands:register', 'storage:read', 'storage:write']
```

No `kernel:access` required.

## Core Changes

### 1. SessionFactory — Emit `usage:recorded` event

In `SessionFactory.wireSideEffects()`, replace the direct `usageStore.append()` + `usageBudget.check()` block with:

```typescript
session.on("agent_event", (event: AgentEvent) => {
  if (event.type !== "usage") return;
  const record: UsageRecord = {
    sessionId: session.id,
    timestamp: new Date().toISOString(),
    tokensUsed: event.tokens ?? 0,
    cost: event.cost ? { amount: event.cost, currency: "USD" } : undefined,
  };
  this.eventBus.emit("usage:recorded", record);
});
```

### 2. Remove from OpenACPCore

- Delete `usageStore` lazy getter
- Delete `usageBudget` lazy getter
- Remove usage-related imports
- Remove usage from `wireSideEffects` dependency parameter type

### 3. Remove `src/plugins/usage/`

Delete entirely:
- `src/plugins/usage/index.ts`
- `src/plugins/usage/usage-store.ts`
- `src/plugins/usage/usage-budget.ts`
- `src/plugins/usage/__tests__/`

### 4. Remove from `core-plugins.ts`

Remove `usagePlugin` from the core plugins array.

## Plugin Structure

```
built-in-plugins/usage-plugin/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts            — Plugin entry
│   ├── usage-store.ts      — Storage via ctx.storage, month-partitioned
│   ├── usage-budget.ts     — Budget checking + status
│   └── __tests__/
│       ├── index.test.ts
│       ├── usage-store.test.ts
│       └── usage-budget.test.ts
```

## Plugin Implementation

### `index.ts` — Plugin Entry

```typescript
const plugin: OpenACPPlugin = {
  name: '@openacp/usage',
  version: '1.0.0',
  description: 'Token usage tracking and budget enforcement',
  permissions: ['events:read', 'events:emit', 'services:register', 'commands:register', 'storage:read', 'storage:write'],

  async setup(ctx: PluginContext) {
    const store = new UsageStore(ctx.storage)
    const config = ctx.pluginConfig as UsagePluginConfig
    const budget = new UsageBudget(store, config)

    // Clean old records on startup
    await store.cleanupExpired(config.retentionDays ?? 90)

    // Listen to usage events from core
    ctx.on('usage:recorded', async (record: UsageRecord) => {
      await store.append(record)

      const result = budget.check()
      if (result.message) {
        ctx.emit('notification:send', {
          message: result.message,
          level: result.status,  // 'warning' | 'exceeded'
        })
      }
    })

    // Register /usage command
    ctx.registerCommand({
      name: 'usage',
      description: 'Show usage summary for current month',
      category: 'plugin',
      handler: async () => {
        const status = await budget.getStatus()
        const lines = [
          'Usage (this month):',
          `  Spent: $${status.used.toFixed(2)}`,
          `  Budget: ${status.budget > 0 ? `$${status.budget.toFixed(2)}` : 'not set'}`,
          `  Status: ${status.status} (${status.percent}%)`,
        ]
        return { type: 'text', text: lines.join('\n') }
      },
    })

    // Expose service for other plugins
    ctx.registerService('usage', { store, budget })

    ctx.log.info('Usage tracking ready')
  },

  async teardown() {
    // Cleanup handled by store
  },

  async install(ctx: InstallContext) {
    const budget = await ctx.terminal.text({
      message: 'Monthly budget in USD (0 = no limit):',
      defaultValue: '0',
      validate: (v) => {
        const n = Number(v.trim())
        if (isNaN(n) || n < 0) return 'Must be a non-negative number'
        return undefined
      },
    })

    const threshold = await ctx.terminal.text({
      message: 'Warning threshold (0-1, e.g. 0.8 = warn at 80%):',
      defaultValue: '0.8',
      validate: (v) => {
        const n = Number(v.trim())
        if (isNaN(n) || n < 0 || n > 1) return 'Must be between 0 and 1'
        return undefined
      },
    })

    const retention = await ctx.terminal.text({
      message: 'Retention days:',
      defaultValue: '90',
      validate: (v) => {
        const n = Number(v.trim())
        if (isNaN(n) || n < 1) return 'Must be a positive number'
        return undefined
      },
    })

    await ctx.settings.setAll({
      monthlyBudget: Number(budget.trim()),
      warningThreshold: Number(threshold.trim()),
      retentionDays: Number(retention.trim()),
    })

    ctx.terminal.log.success('Usage plugin configured')
  },

  async configure(ctx: InstallContext) {
    const current = await ctx.settings.getAll()
    // Same as install but with current values as defaults
    // ... (similar flow with pre-filled defaults)
  },

  async uninstall(ctx: InstallContext, opts: { purge: boolean }) {
    if (opts.purge) {
      await ctx.settings.clear()
      // Storage is automatically cleaned up with plugin removal
    }
    ctx.terminal.log.success('Usage plugin removed')
  },
}
```

### `usage-store.ts` — Storage Layer

Uses `ctx.storage` with month-partitioned keys:

```typescript
export class UsageStore {
  constructor(private storage: PluginStorage) {}

  async append(record: UsageRecord): Promise<void> {
    const key = this.monthKey(record.timestamp)
    const records = await this.getMonth(key)
    records.push(record)
    await this.storage.set(key, records)
  }

  async getMonthlyTotal(date?: Date): Promise<{ totalCost: number; currency: string }> {
    const key = this.monthKey((date ?? new Date()).toISOString())
    const records = await this.getMonth(key)
    const totalCost = records.reduce((sum, r) => sum + (r.cost?.amount ?? 0), 0)
    const currency = records.find(r => r.cost?.currency)?.cost?.currency ?? 'USD'
    return { totalCost, currency }
  }

  async cleanupExpired(retentionDays: number): Promise<void> {
    const keys = await this.storage.list()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)
    const cutoffKey = this.monthKey(cutoff.toISOString())

    for (const key of keys) {
      if (key.startsWith('records:') && key < cutoffKey) {
        await this.storage.delete(key)
      }
    }
  }

  private monthKey(timestamp: string): string {
    const d = new Date(timestamp)
    return `records:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  private async getMonth(key: string): Promise<UsageRecord[]> {
    return (await this.storage.get(key)) as UsageRecord[] ?? []
  }
}
```

### `usage-budget.ts` — Budget Logic

Simplified from current implementation, same core logic:

```typescript
export class UsageBudget {
  private lastNotifiedStatus: 'ok' | 'warning' | 'exceeded' = 'ok'
  private lastNotifiedMonth: number

  constructor(
    private store: UsageStore,
    private config: UsagePluginConfig,
  ) {
    this.lastNotifiedMonth = new Date().getMonth()
  }

  check(): { status: 'ok' | 'warning' | 'exceeded'; message?: string } {
    // Same logic as current UsageBudget.check()
    // De-duplicate notifications per status change per month
    // Return formatted message with progress bar
  }

  async getStatus(): Promise<{ status: string; used: number; budget: number; percent: number }> {
    const { totalCost } = await this.store.getMonthlyTotal()
    const budget = this.config.monthlyBudget ?? 0
    // ... same status calculation
  }
}
```

## Config Type

```typescript
interface UsagePluginConfig {
  monthlyBudget?: number      // 0 or undefined = no limit
  warningThreshold?: number   // 0-1, default 0.8
  retentionDays?: number      // default 90
}
```

## Event Contracts

### `usage:recorded` (Core → Plugin)

```typescript
interface UsageRecordEvent {
  sessionId: string
  timestamp: string        // ISO 8601
  tokensUsed: number
  cost?: { amount: number; currency: string }
}
```

### `notification:send` (Plugin → Notifications Plugin)

```typescript
interface NotificationEvent {
  message: string
  level: 'warning' | 'exceeded'
}
```

## Migration & Backward Compatibility

- Old `~/.openacp/usage.json` is abandoned. No migration needed.
- Users upgrading will lose historical usage data (accepted trade-off).
- The `usage` service name stays the same, so any plugin querying `getService('usage')` continues to work.
- Legacy config fields (`config.usage.*`) are handled by LifecycleManager's config resolution fallback.

## Testing Strategy

- **usage-store.test.ts**: Test append, monthly totals, cleanup, month-partitioned keys
- **usage-budget.test.ts**: Test budget check with warning/exceeded thresholds, month boundary reset, de-duplication
- **index.test.ts**: Integration test — mock PluginContext, emit `usage:recorded`, verify storage + notification events
