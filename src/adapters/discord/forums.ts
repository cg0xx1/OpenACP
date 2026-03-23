import { ChannelType } from 'discord.js'
import type { ForumChannel, ThreadChannel, Guild, TextChannel } from 'discord.js'
import { log } from '../../core/log.js'

// ─── ensureForums ─────────────────────────────────────────────────────────────

/**
 * Ensures both the forum channel and notification channel exist.
 * Creates them if their IDs are null, then persists the IDs via saveConfig.
 *
 * saveConfig uses nested object path: { channels: { discord: { forumChannelId: ... } } }
 */
export async function ensureForums(
  guild: Guild,
  config: {
    forumChannelId: string | null
    notificationChannelId: string | null
  },
  saveConfig: (updates: Record<string, unknown>) => Promise<void>,
): Promise<{ forumChannel: ForumChannel; notificationChannel: TextChannel }> {
  let forumChannelId = config.forumChannelId
  let notificationChannelId = config.notificationChannelId

  // Ensure forum channel exists
  if (!forumChannelId) {
    const channel = await guild.channels.create({
      name: 'openacp-sessions',
      type: ChannelType.GuildForum,
    })
    forumChannelId = channel.id
    await saveConfig({ channels: { discord: { forumChannelId: channel.id } } })
    log.info({ forumChannelId: channel.id }, '[forums] Created forum channel')
  }

  // Ensure notification channel exists
  if (!notificationChannelId) {
    const channel = await guild.channels.create({
      name: 'openacp-notifications',
      type: ChannelType.GuildText,
    })
    notificationChannelId = channel.id
    await saveConfig({ channels: { discord: { notificationChannelId: channel.id } } })
    log.info({ notificationChannelId: channel.id }, '[forums] Created notification channel')
  }

  const forumChannel = guild.channels.cache.get(forumChannelId) as ForumChannel
    ?? await guild.channels.fetch(forumChannelId) as ForumChannel

  const notificationChannel = guild.channels.cache.get(notificationChannelId) as TextChannel
    ?? await guild.channels.fetch(notificationChannelId) as TextChannel

  return { forumChannel, notificationChannel }
}

// ─── createSessionThread ──────────────────────────────────────────────────────

/**
 * Creates a new thread in the forum channel with an initial "⏳ Setting up..." message.
 * Returns the created ThreadChannel.
 */
export async function createSessionThread(
  forumChannel: ForumChannel,
  name: string,
): Promise<ThreadChannel> {
  const thread = await forumChannel.threads.create({
    name,
    message: { content: '⏳ Setting up...' },
  })
  return thread
}

// ─── renameSessionThread ──────────────────────────────────────────────────────

/**
 * Fetches and renames a thread. Ignores all errors (thread may be deleted/archived).
 */
export async function renameSessionThread(
  guild: Guild,
  threadId: string,
  newName: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(threadId)
      ?? await guild.channels.fetch(threadId)
    if (channel && 'setName' in channel) {
      await (channel as ThreadChannel).setName(newName)
    }
  } catch {
    // Ignore — thread may be deleted or archived
  }
}

// ─── deleteSessionThread ──────────────────────────────────────────────────────

/**
 * Fetches and deletes a thread. Ignores all errors.
 */
export async function deleteSessionThread(
  guild: Guild,
  threadId: string,
): Promise<void> {
  try {
    const channel = guild.channels.cache.get(threadId)
      ?? await guild.channels.fetch(threadId)
    if (channel && 'delete' in channel) {
      await (channel as ThreadChannel).delete()
    }
  } catch {
    // Ignore — thread may already be deleted
  }
}

// ─── ensureUnarchived ─────────────────────────────────────────────────────────

/**
 * If the thread is archived, unarchives it.
 */
export async function ensureUnarchived(thread: ThreadChannel): Promise<void> {
  if (thread.archived) {
    try {
      await thread.setArchived(false)
    } catch (err) {
      log.warn({ err, threadId: thread.id }, '[forums] Failed to unarchive thread')
    }
  }
}

// ─── buildDeepLink ────────────────────────────────────────────────────────────

/**
 * Builds a Discord deep link URL to a channel/thread, optionally to a specific message.
 */
export function buildDeepLink(
  guildId: string,
  channelId: string,
  messageId?: string,
): string {
  const base = `https://discord.com/channels/${guildId}/${channelId}`
  return messageId ? `${base}/${messageId}` : base
}
