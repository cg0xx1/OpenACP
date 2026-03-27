import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { UsageStore } from '../usage-store.js'
import type { PluginStorage } from '../../../core/plugin/types.js'
import type { UsageRecord } from '../../../core/types.js'

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

function makeRecord(overrides: Partial<UsageRecord> = {}): UsageRecord {
  return {
    id: 'rec-1',
    sessionId: 'sess-1',
    agentName: 'claude',
    tokensUsed: 1000,
    contextSize: 5000,
    cost: { amount: 0.05, currency: 'USD' },
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

describe('UsageStore', () => {
  let storage: PluginStorage
  let store: UsageStore

  beforeEach(() => {
    vi.useFakeTimers()
    storage = mockStorage()
    store = new UsageStore(storage)
  })

  afterEach(() => {
    store.destroy()
    vi.useRealTimers()
  })

  describe('append', () => {
    it('adds record to in-memory cache', async () => {
      const record = makeRecord()
      await store.append(record)

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBe(0.05)
      expect(total.currency).toBe('USD')
    })

    it('loads from storage on first append for a new month key', async () => {
      const existing = makeRecord({ id: 'old-1', cost: { amount: 0.10, currency: 'USD' } })
      const key = `records:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      await storage.set(key, [existing])

      await store.append(makeRecord({ id: 'new-1' }))

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBeCloseTo(0.15)
    })

    it('schedules debounced flush', async () => {
      await store.append(makeRecord())
      expect(storage.set).not.toHaveBeenCalledWith(expect.stringContaining('records:'), expect.anything())

      vi.advanceTimersByTime(2000)
      await vi.waitFor(() => {
        expect(storage.set).toHaveBeenCalled()
      })
    })
  })

  describe('getMonthlyTotal', () => {
    it('returns zero for empty cache', () => {
      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBe(0)
      expect(total.currency).toBe('USD')
    })

    it('sums costs across multiple records', async () => {
      await store.append(makeRecord({ id: '1', cost: { amount: 0.10, currency: 'USD' } }))
      await store.append(makeRecord({ id: '2', cost: { amount: 0.25, currency: 'USD' } }))
      await store.append(makeRecord({ id: '3', cost: { amount: 0.05, currency: 'USD' } }))

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBeCloseTo(0.40)
    })

    it('handles records without cost', async () => {
      await store.append(makeRecord({ id: '1', cost: undefined }))
      await store.append(makeRecord({ id: '2', cost: { amount: 0.10, currency: 'USD' } }))

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBeCloseTo(0.10)
    })

    it('returns totals for specific month', async () => {
      await store.append(makeRecord({ id: '1', timestamp: '2026-01-15T00:00:00Z', cost: { amount: 0.50, currency: 'USD' } }))
      await store.append(makeRecord({ id: '2', timestamp: '2026-02-15T00:00:00Z', cost: { amount: 0.30, currency: 'USD' } }))

      const janTotal = store.getMonthlyTotal(new Date('2026-01-15'))
      expect(janTotal.totalCost).toBeCloseTo(0.50)

      const febTotal = store.getMonthlyTotal(new Date('2026-02-15'))
      expect(febTotal.totalCost).toBeCloseTo(0.30)
    })
  })

  describe('flush', () => {
    it('writes all dirty keys to storage', async () => {
      await store.append(makeRecord())
      await store.flush()

      const key = `records:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      expect(storage.set).toHaveBeenCalledWith(key, expect.any(Array))
    })

    it('clears dirty set after flush', async () => {
      await store.append(makeRecord());

      // Reset mock to track only flush calls
      (storage.set as ReturnType<typeof vi.fn>).mockClear()

      await store.flush()
      expect(storage.set).toHaveBeenCalledTimes(1);

      // Second flush should not write again
      (storage.set as ReturnType<typeof vi.fn>).mockClear()
      await store.flush()
      expect(storage.set).not.toHaveBeenCalled()
    })

    it('cancels pending debounced flush', async () => {
      await store.append(makeRecord())

      // Manually flush — this should clear the pending debounce timer
      // and write all dirty keys to storage
      store.flush()

      // Advance past the debounce period and verify no extra writes occur
      const setCalls = (storage.set as ReturnType<typeof vi.fn>).mock.calls.length
      vi.advanceTimersByTime(5000)

      // No additional set calls beyond what flush() already did
      expect((storage.set as ReturnType<typeof vi.fn>).mock.calls.length).toBe(setCalls)
    })
  })

  describe('loadFromStorage', () => {
    it('loads current month records into cache', async () => {
      const key = `records:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      const existing = [makeRecord({ id: 'stored-1', cost: { amount: 1.00, currency: 'USD' } })]
      await storage.set(key, existing)

      await store.loadFromStorage()

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBeCloseTo(1.00)
    })

    it('handles empty storage gracefully', async () => {
      await store.loadFromStorage()

      const total = store.getMonthlyTotal()
      expect(total.totalCost).toBe(0)
    })
  })

  describe('cleanupExpired', () => {
    it('deletes records older than retention period', async () => {
      // Store old records under a key from 6 months ago
      await storage.set('records:2025-01', [makeRecord()])
      await storage.set('records:2025-06', [makeRecord()])
      // Current month should stay
      const currentKey = `records:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      await storage.set(currentKey, [makeRecord()])

      await store.cleanupExpired(90)

      expect(storage.delete).toHaveBeenCalledWith('records:2025-01')
      expect(storage.delete).toHaveBeenCalledWith('records:2025-06')
      expect(storage.delete).not.toHaveBeenCalledWith(currentKey)
    })

    it('does nothing when no expired keys exist', async () => {
      const currentKey = `records:${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
      await storage.set(currentKey, [makeRecord()])

      await store.cleanupExpired(90)

      expect(storage.delete).not.toHaveBeenCalled()
    })
  })
})
