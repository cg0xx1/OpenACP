import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { TokenStore } from '../auth/token-store.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('TokenStore — codes', () => {
  let store: TokenStore
  let tmpDir: string
  let filePath: string

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-codes-'))
    filePath = path.join(tmpDir, 'tokens.json')
    store = new TokenStore(filePath)
    await store.load()
  })

  afterEach(() => {
    store.destroy()
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('creates a code with 32-char hex string', () => {
    const code = store.createCode({ role: 'admin', name: 'test-code', expire: '24h' })
    expect(code.code).toMatch(/^[0-9a-f]{32}$/)
    expect(code.role).toBe('admin')
    expect(code.name).toBe('test-code')
    expect(code.expire).toBe('24h')
    expect(code.used).toBe(false)
  })

  it('creates code with 30-minute TTL by default', () => {
    const before = Date.now()
    const code = store.createCode({ role: 'admin', name: 'test', expire: '24h' })
    const expiresAt = new Date(code.expiresAt).getTime()
    const thirtyMin = 30 * 60 * 1000
    expect(expiresAt).toBeGreaterThanOrEqual(before + thirtyMin - 100)
    expect(expiresAt).toBeLessThanOrEqual(before + thirtyMin + 1000)
  })

  it('gets a code by code string', () => {
    const created = store.createCode({ role: 'viewer', name: 'test', expire: '1h' })
    const found = store.getCode(created.code)
    expect(found).toBeDefined()
    expect(found!.role).toBe('viewer')
  })

  it('returns undefined for unknown code', () => {
    expect(store.getCode('nonexistent')).toBeUndefined()
  })

  it('exchanges code: marks used and returns true', () => {
    const created = store.createCode({ role: 'admin', name: 'test', expire: '24h' })
    const result = store.exchangeCode(created.code)
    expect(result).toBeDefined()
    expect(result!.used).toBe(true)
    // second exchange fails
    expect(store.exchangeCode(created.code)).toBeUndefined()
  })

  it('exchange fails for expired code', () => {
    vi.useFakeTimers()
    const code = store.createCode({ role: 'admin', name: 'test', expire: '24h' })
    vi.advanceTimersByTime(31 * 60 * 1000) // 31 minutes
    expect(store.exchangeCode(code.code)).toBeUndefined()
    vi.useRealTimers()
  })

  it('lists only active codes (not used, not expired)', () => {
    const c1 = store.createCode({ role: 'admin', name: 'c1', expire: '24h' })
    store.createCode({ role: 'admin', name: 'c2', expire: '24h' })
    store.exchangeCode(c1.code) // mark used
    const active = store.listCodes()
    expect(active).toHaveLength(1)
    expect(active[0].name).toBe('c2')
  })

  it('revokes unused code', () => {
    const code = store.createCode({ role: 'admin', name: 'test', expire: '24h' })
    store.revokeCode(code.code)
    expect(store.getCode(code.code)).toBeUndefined()
  })

  it('persists codes to disk and reloads', async () => {
    store.createCode({ role: 'admin', name: 'persist-test', expire: '24h' })
    await store.save()

    const store2 = new TokenStore(filePath)
    await store2.load()
    const codes = store2.listCodes()
    expect(codes).toHaveLength(1)
    expect(codes[0].name).toBe('persist-test')
    store2.destroy()
  })

  it('cleanup removes expired and used codes', () => {
    vi.useFakeTimers()
    const c1 = store.createCode({ role: 'admin', name: 'used', expire: '24h' })
    store.createCode({ role: 'admin', name: 'expired', expire: '24h', codeTtlMs: 1000 })
    store.createCode({ role: 'admin', name: 'active', expire: '24h' })
    store.exchangeCode(c1.code)
    vi.advanceTimersByTime(2000) // expire the short-TTL code
    store.cleanup()
    const remaining = store.listCodes()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('active')
    vi.useRealTimers()
  })
})
