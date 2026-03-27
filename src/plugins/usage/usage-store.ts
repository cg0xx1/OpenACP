import type { PluginStorage } from '../../core/plugin/types.js'
import type { UsageRecord } from '../../core/types.js'

const DEBOUNCE_MS = 2000

export class UsageStore {
  private cache = new Map<string, UsageRecord[]>()
  private dirty = new Set<string>()
  private flushTimer: ReturnType<typeof setTimeout> | null = null

  constructor(private storage: PluginStorage) {}

  /** Load current month's records into memory on startup */
  async loadFromStorage(): Promise<void> {
    const key = this.monthKey(new Date().toISOString())
    const records = (await this.storage.get<UsageRecord[]>(key)) ?? []
    this.cache.set(key, records)
  }

  /** Append a record (in-memory, schedules debounced flush) */
  async append(record: UsageRecord): Promise<void> {
    const key = this.monthKey(record.timestamp)
    if (!this.cache.has(key)) {
      const existing = (await this.storage.get<UsageRecord[]>(key)) ?? []
      this.cache.set(key, existing)
    }
    this.cache.get(key)!.push(record)
    this.dirty.add(key)
    this.scheduleFlush()
  }

  /** Get monthly cost total (reads from cache) */
  getMonthlyTotal(date?: Date): { totalCost: number; currency: string } {
    const key = this.monthKey((date ?? new Date()).toISOString())
    const records = this.cache.get(key) ?? []
    const totalCost = records.reduce((sum, r) => sum + (r.cost?.amount ?? 0), 0)
    const currency = records.find(r => r.cost?.currency)?.cost?.currency ?? 'USD'
    return { totalCost, currency }
  }

  /** Flush all dirty keys to storage immediately */
  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    for (const key of this.dirty) {
      const records = this.cache.get(key)
      if (records) await this.storage.set(key, records)
    }
    this.dirty.clear()
  }

  /** Delete records older than retention period */
  async cleanupExpired(retentionDays: number): Promise<void> {
    const keys = await this.storage.list()
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - retentionDays)
    const cutoffKey = this.monthKey(cutoff.toISOString())

    for (const key of keys) {
      if (key.startsWith('records:') && key < cutoffKey) {
        await this.storage.delete(key)
        this.cache.delete(key)
      }
    }
  }

  /** Destroy timers for clean shutdown */
  destroy(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null
      void this.flush()
    }, DEBOUNCE_MS)
  }

  private monthKey(timestamp: string): string {
    const d = new Date(timestamp)
    return `records:${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
}
