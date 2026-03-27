import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UsageBudget } from '../usage-budget.js'
import type { UsagePluginConfig } from '../usage-budget.js'
import { UsageStore } from '../usage-store.js'
import type { PluginStorage } from '../../../core/plugin/types.js'

function mockStorage(): PluginStorage {
  const data = new Map<string, unknown>()
  return {
    get: vi.fn(async <T>(key: string) => data.get(key) as T | undefined),
    set: vi.fn(async <T>(key: string, value: T) => { data.set(key, value) }),
    delete: vi.fn(async (key: string) => { data.delete(key) }),
    list: vi.fn(async () => [...data.keys()]),
    getDataDir: vi.fn(() => '/tmp/usage-test'),
  }
}

function makeRecord(cost: number) {
  return {
    id: `rec-${Math.random()}`,
    sessionId: 'sess-1',
    agentName: 'claude',
    tokensUsed: 1000,
    contextSize: 5000,
    cost: { amount: cost, currency: 'USD' },
    timestamp: new Date().toISOString(),
  }
}

describe('UsageBudget', () => {
  let store: UsageStore
  let storage: PluginStorage

  beforeEach(() => {
    vi.useFakeTimers()
    storage = mockStorage()
    store = new UsageStore(storage)
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  describe('check', () => {
    it('returns ok when no budget is set', async () => {
      const budget = new UsageBudget(store, { monthlyBudget: 0 })
      const result = budget.check()
      expect(result.status).toBe('ok')
      expect(result.message).toBeUndefined()
    })

    it('returns ok when spending is below threshold', async () => {
      await store.append(makeRecord(5.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100, warningThreshold: 0.8 })

      const result = budget.check()
      expect(result.status).toBe('ok')
      expect(result.message).toBeUndefined()
    })

    it('returns warning when threshold is crossed', async () => {
      await store.append(makeRecord(85.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100, warningThreshold: 0.8 })

      const result = budget.check()
      expect(result.status).toBe('warning')
      expect(result.message).toContain('Budget warning')
      expect(result.message).toContain('$85.00')
      expect(result.message).toContain('$100.00')
      expect(result.message).toContain('85%')
    })

    it('returns exceeded when budget is exceeded', async () => {
      await store.append(makeRecord(110.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100, warningThreshold: 0.8 })

      const result = budget.check()
      expect(result.status).toBe('exceeded')
      expect(result.message).toContain('Budget exceeded')
      expect(result.message).toContain('$110.00')
    })

    it('deduplicates notifications - only notifies on status change', async () => {
      const config: UsagePluginConfig = { monthlyBudget: 100, warningThreshold: 0.8 }

      await store.append(makeRecord(85.00))
      const budget = new UsageBudget(store, config)

      // First check: warning with message
      const first = budget.check()
      expect(first.status).toBe('warning')
      expect(first.message).toBeDefined()

      // Second check at same level: no message
      const second = budget.check()
      expect(second.status).toBe('warning')
      expect(second.message).toBeUndefined()
    })

    it('escalates from warning to exceeded', async () => {
      const config: UsagePluginConfig = { monthlyBudget: 100, warningThreshold: 0.8 }

      await store.append(makeRecord(85.00))
      const budget = new UsageBudget(store, config)

      const warning = budget.check()
      expect(warning.status).toBe('warning')
      expect(warning.message).toBeDefined()

      // Add more cost to exceed budget
      await store.append(makeRecord(20.00))

      const exceeded = budget.check()
      expect(exceeded.status).toBe('exceeded')
      expect(exceeded.message).toContain('Budget exceeded')
    })

    it('resets notification tracking on month boundary', async () => {
      const config: UsagePluginConfig = { monthlyBudget: 100, warningThreshold: 0.8 }

      await store.append(makeRecord(85.00))
      const budget = new UsageBudget(store, config)

      // Trigger warning
      const first = budget.check()
      expect(first.message).toBeDefined()

      // Simulate month change by advancing time
      const nextMonth = new Date()
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      vi.setSystemTime(nextMonth)

      // Add usage in new month
      await store.append(makeRecord(85.00))

      // Should get a new warning since month changed
      const afterReset = budget.check()
      expect(afterReset.status).toBe('warning')
      expect(afterReset.message).toBeDefined()
    })
  })

  describe('getStatus', () => {
    it('returns status with zero budget', () => {
      const budget = new UsageBudget(store, { monthlyBudget: 0 })
      const status = budget.getStatus()
      expect(status.status).toBe('ok')
      expect(status.used).toBe(0)
      expect(status.budget).toBe(0)
      expect(status.percent).toBe(0)
    })

    it('returns correct percentage', async () => {
      await store.append(makeRecord(25.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100 })

      const status = budget.getStatus()
      expect(status.status).toBe('ok')
      expect(status.used).toBeCloseTo(25.00)
      expect(status.budget).toBe(100)
      expect(status.percent).toBe(25)
    })

    it('returns warning status at threshold', async () => {
      await store.append(makeRecord(80.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100, warningThreshold: 0.8 })

      const status = budget.getStatus()
      expect(status.status).toBe('warning')
    })

    it('returns exceeded status over budget', async () => {
      await store.append(makeRecord(120.00))
      const budget = new UsageBudget(store, { monthlyBudget: 100 })

      const status = budget.getStatus()
      expect(status.status).toBe('exceeded')
      expect(status.percent).toBe(120)
    })
  })

  describe('progressBar', () => {
    it('renders correct bar at 50%', () => {
      const budget = new UsageBudget(store, { monthlyBudget: 100 })
      const bar = budget.progressBar(0.5)
      expect(bar).toBe('\u2588\u2588\u2588\u2588\u2588\u2591\u2591\u2591\u2591\u2591')
    })

    it('renders full bar at 100%', () => {
      const budget = new UsageBudget(store, { monthlyBudget: 100 })
      const bar = budget.progressBar(1.0)
      expect(bar).toBe('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588')
    })

    it('caps bar at 10 filled blocks for values over 100%', () => {
      const budget = new UsageBudget(store, { monthlyBudget: 100 })
      const bar = budget.progressBar(1.5)
      expect(bar).toBe('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588')
    })

    it('renders empty bar at 0%', () => {
      const budget = new UsageBudget(store, { monthlyBudget: 100 })
      const bar = budget.progressBar(0)
      expect(bar).toBe('\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591\u2591')
    })
  })
})
