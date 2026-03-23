import type { App, BlockAction, ButtonAction } from "@slack/bolt";
import type { ISlackSendQueue } from "./send-queue.js";

export type PermissionResponseCallback = (requestId: string, optionId: string) => void;

export interface ISlackPermissionHandler {
  register(app: App): void;
}

export class SlackPermissionHandler implements ISlackPermissionHandler {
  constructor(
    private queue: ISlackSendQueue,
    private onResponse: PermissionResponseCallback,
  ) {}

  register(app: App): void {
    // Match any action starting with "perm_action_"
    app.action<BlockAction<ButtonAction>>(
      /^perm_action_/,
      async ({ ack, body, action }) => {
        await ack();

        const value: string = action.value ?? "";
        const colonIdx = value.indexOf(":");
        if (colonIdx === -1) return;

        const requestId = value.slice(0, colonIdx);
        const optionId  = value.slice(colonIdx + 1);

        this.onResponse(requestId, optionId);

        // Update message to remove action buttons and show confirmation
        const message = body.message;
        if (message) {
          await this.queue.enqueue("chat.update", {
            channel: body.channel?.id ?? "",
            ts: message.ts,
            text: `✅ Permission response: *${optionId}*`,
            blocks: [],
          });
        }
      }
    );
  }
}
