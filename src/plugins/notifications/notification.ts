import type { IChannelAdapter } from '../../core/channel.js'
import type { NotificationMessage } from '../../core/types.js'

export class NotificationManager {
  constructor(private adapters: Map<string, IChannelAdapter>) {}

  async notify(channelId: string, notification: NotificationMessage): Promise<void> {
    const adapter = this.adapters.get(channelId)
    if (adapter) {
      await adapter.sendNotification(notification)
    }
  }

  async notifyAll(notification: NotificationMessage): Promise<void> {
    for (const adapter of this.adapters.values()) {
      await adapter.sendNotification(notification)
    }
  }
}
