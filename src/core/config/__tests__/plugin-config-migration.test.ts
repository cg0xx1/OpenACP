import { describe, it, expect } from 'vitest'
import { migrateConfig, needsMigration } from '../plugin-config-migration.js'

describe('Plugin Config Migration', () => {
  it('detects old config (no plugins field)', () => {
    const old = { defaultAgent: 'claude', channels: { telegram: { botToken: 'abc' } } }
    expect(needsMigration(old)).toBe(true)
  })

  it('already-migrated config needs no migration', () => {
    const migrated = { defaultAgent: 'claude', plugins: { builtin: {} } }
    expect(needsMigration(migrated)).toBe(false)
  })

  it('maps channels.telegram to plugins.builtin', () => {
    const old = { channels: { telegram: { botToken: 'abc', chatId: 123, enabled: true, displayVerbosity: 'medium' } } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/telegram'].config.botToken).toBe('abc')
    expect(result.plugins.builtin['@openacp/telegram'].config.chatId).toBe(123)
    expect(result.plugins.builtin['@openacp/telegram'].enabled).toBe(true)
  })

  it('maps channels.discord to plugins.builtin', () => {
    const old = { channels: { discord: { botToken: 'disc-token', guildId: '999', enabled: false } } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/discord'].config.botToken).toBe('disc-token')
    expect(result.plugins.builtin['@openacp/discord'].config.guildId).toBe('999')
    expect(result.plugins.builtin['@openacp/discord'].enabled).toBe(false)
  })

  it('maps channels.slack to plugins.builtin', () => {
    const old = { channels: { slack: { botToken: 'xoxb-123', appToken: 'xapp-456', enabled: true } } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/slack'].config.botToken).toBe('xoxb-123')
    expect(result.plugins.builtin['@openacp/slack'].config.appToken).toBe('xapp-456')
    expect(result.plugins.builtin['@openacp/slack'].enabled).toBe(true)
  })

  it('maps security to plugins.builtin', () => {
    const old = { security: { allowedUserIds: ['123'], maxConcurrentSessions: 5 } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/security'].config.allowedUserIds).toEqual(['123'])
  })

  it('maps speech to plugins.builtin', () => {
    const old = { speech: { sttProvider: 'groq', groqApiKey: 'key' } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/speech'].config.sttProvider).toBe('groq')
  })

  it('maps tunnel to plugins.builtin', () => {
    const old = { tunnel: { provider: 'cloudflare', subdomain: 'my-tunnel' } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/tunnel'].config.provider).toBe('cloudflare')
    expect(result.plugins.builtin['@openacp/tunnel'].config.subdomain).toBe('my-tunnel')
  })

  it('maps usage to plugins.builtin', () => {
    const old = { usage: { retentionDays: 60, budgetMonthly: 100 } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/usage'].config.retentionDays).toBe(60)
    expect(result.plugins.builtin['@openacp/usage'].config.budgetMonthly).toBe(100)
  })

  it('maps api to plugins.builtin', () => {
    const old = { api: { port: 8080, host: '0.0.0.0' } }
    const result = migrateConfig(old)
    expect(result.plugins.builtin['@openacp/api-server'].config.port).toBe(8080)
    expect(result.plugins.builtin['@openacp/api-server'].config.host).toBe('0.0.0.0')
  })

  it('preserves top-level fields', () => {
    const old = { defaultAgent: 'claude', workingDirectory: '/tmp', debug: true, channels: {} }
    const result = migrateConfig(old)
    expect(result.defaultAgent).toBe('claude')
    expect(result.workingDirectory).toBe('/tmp')
    expect(result.debug).toBe(true)
  })

  it('removes migrated sections from top level', () => {
    const old = {
      defaultAgent: 'claude',
      channels: { telegram: { botToken: 'abc' } },
      security: { allowedUserIds: [] },
      speech: { sttProvider: 'groq' },
      tunnel: { provider: 'cloudflare' },
      usage: { retentionDays: 30 },
      api: { port: 3000 },
    }
    const result = migrateConfig(old)
    expect('channels' in result).toBe(false)
    expect('security' in result).toBe(false)
    expect('speech' in result).toBe(false)
    expect('tunnel' in result).toBe(false)
    expect('usage' in result).toBe(false)
    expect('api' in result).toBe(false)
    expect(result.defaultAgent).toBe('claude')
  })

  it('migrates all 8 field groups together', () => {
    const old = {
      defaultAgent: 'claude',
      channels: {
        telegram: { botToken: 'tg', chatId: 1 },
        discord: { botToken: 'disc', guildId: '2' },
        slack: { botToken: 'slack', appToken: 'app' },
      },
      security: { allowedUserIds: ['u1'] },
      speech: { sttProvider: 'groq' },
      tunnel: { provider: 'cloudflare' },
      usage: { retentionDays: 30 },
      api: { port: 8080 },
    }
    const result = migrateConfig(old)
    expect(Object.keys(result.plugins.builtin).sort()).toEqual([
      '@openacp/api-server',
      '@openacp/discord',
      '@openacp/security',
      '@openacp/slack',
      '@openacp/speech',
      '@openacp/telegram',
      '@openacp/tunnel',
      '@openacp/usage',
    ])
  })

  it('is idempotent', () => {
    const old = { defaultAgent: 'claude', channels: { telegram: { botToken: 'abc' } } }
    const first = migrateConfig(old)
    expect(needsMigration(first)).toBe(false)
  })

  it('handles missing channel sections gracefully', () => {
    const old = { channels: {} }
    const result = migrateConfig(old)
    expect(Object.keys(result.plugins.builtin)).toEqual([])
  })

  it('handles missing top-level sections gracefully', () => {
    const old = { defaultAgent: 'claude' }
    const result = migrateConfig(old)
    expect(Object.keys(result.plugins.builtin)).toEqual([])
  })
})
