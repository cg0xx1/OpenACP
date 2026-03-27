import type { UsageStore } from './usage-store.js'

export interface UsagePluginConfig {
  monthlyBudget?: number
  warningThreshold?: number
  retentionDays?: number
}

export type BudgetStatus = 'ok' | 'warning' | 'exceeded'

export class UsageBudget {
  private lastNotifiedStatus: BudgetStatus = 'ok'
  private lastNotifiedMonth: number

  constructor(
    private store: UsageStore,
    private config: UsagePluginConfig,
  ) {
    this.lastNotifiedMonth = new Date().getMonth()
  }

  /** Check budget and return notification if status changed */
  check(): { status: BudgetStatus; message?: string } {
    const budget = this.config.monthlyBudget ?? 0
    if (budget <= 0) return { status: 'ok' }

    const { totalCost } = this.store.getMonthlyTotal()
    const percent = totalCost / budget
    const threshold = this.config.warningThreshold ?? 0.8
    const currentMonth = new Date().getMonth()

    // Reset notification tracking on month change
    if (currentMonth !== this.lastNotifiedMonth) {
      this.lastNotifiedStatus = 'ok'
      this.lastNotifiedMonth = currentMonth
    }

    let status: BudgetStatus = 'ok'
    if (percent >= 1) status = 'exceeded'
    else if (percent >= threshold) status = 'warning'

    // Only notify on status escalation (ok -> warning -> exceeded)
    let message: string | undefined
    if (status !== 'ok' && status !== this.lastNotifiedStatus) {
      const bar = this.progressBar(percent)
      message = status === 'exceeded'
        ? `Budget exceeded! ${bar} $${totalCost.toFixed(2)} / $${budget.toFixed(2)}`
        : `Budget warning: ${bar} $${totalCost.toFixed(2)} / $${budget.toFixed(2)} (${(percent * 100).toFixed(0)}%)`
      this.lastNotifiedStatus = status
    }

    return { status, message }
  }

  /** Get current budget status for /usage command */
  getStatus(): { status: string; used: number; budget: number; percent: number } {
    const { totalCost } = this.store.getMonthlyTotal()
    const budget = this.config.monthlyBudget ?? 0
    const percent = budget > 0 ? Math.round((totalCost / budget) * 100) : 0
    let status = 'ok'
    if (budget > 0) {
      if (totalCost >= budget) status = 'exceeded'
      else if (totalCost >= budget * (this.config.warningThreshold ?? 0.8)) status = 'warning'
    }
    return { status, used: totalCost, budget, percent }
  }

  progressBar(percent: number): string {
    const filled = Math.min(Math.round(percent * 10), 10)
    return '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled)
  }
}
