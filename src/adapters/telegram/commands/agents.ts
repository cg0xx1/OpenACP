import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { OpenACPCore } from "../../../core/core.js";
import type { InstallProgress } from "../../../core/types.js";

export async function handleAgents(ctx: Context, core: OpenACPCore): Promise<void> {
  const catalog = core.agentCatalog;
  const items = catalog.getAvailable();

  const installed = items.filter((i) => i.installed);
  const available = items.filter((i) => !i.installed);

  let text = "<b>🤖 Agents</b>\n\n";

  if (installed.length > 0) {
    text += "<b>Installed:</b>\n";
    for (const item of installed) {
      text += `✅ <b>${escapeHtml(item.name)}</b> — ${item.distribution}\n`;
    }
    text += "\n";
  }

  if (available.length > 0) {
    text += "<b>Available to install:</b>\n";
    const shown = available.slice(0, 12);
    for (const item of shown) {
      if (item.available) {
        text += `⬇️ ${escapeHtml(item.name)}\n`;
      } else {
        const deps = item.missingDeps?.join(", ") ?? "requirements not met";
        text += `⚠️ ${escapeHtml(item.name)} <i>(needs: ${escapeHtml(deps)})</i>\n`;
      }
    }
    if (available.length > 12) {
      text += `\n<i>...and ${available.length - 12} more</i>\n`;
    }
  }

  const keyboard = new InlineKeyboard();
  const installable = available.filter((i) => i.available).slice(0, 6);
  for (let i = 0; i < installable.length; i += 3) {
    const row = installable.slice(i, i + 3);
    for (const item of row) {
      keyboard.text(`⬇️ ${item.name}`, `ag:install:${item.key}`);
    }
    keyboard.row();
  }

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: installable.length > 0 ? keyboard : undefined });
}

export async function handleInstall(ctx: Context, core: OpenACPCore): Promise<void> {
  const text = (ctx.message?.text ?? "").trim();
  const parts = text.split(/\s+/);
  const nameOrId = parts[1];

  if (!nameOrId) {
    await ctx.reply(
      "To install an agent, use:\n<code>/install gemini</code>\n\nUse /agents to see what's available.",
      { parse_mode: "HTML" },
    );
    return;
  }

  await installAgentWithProgress(ctx, core, nameOrId);
}

export async function handleAgentInstallCallback(ctx: Context, core: OpenACPCore): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const nameOrId = data.replace("ag:install:", "");
  await ctx.answerCallbackQuery();
  await installAgentWithProgress(ctx, core, nameOrId);
}

async function installAgentWithProgress(ctx: Context, core: OpenACPCore, nameOrId: string): Promise<void> {
  const catalog = core.agentCatalog;
  const msg = await ctx.reply(`⏳ Installing ${nameOrId}...`);

  let lastEdit = 0;
  const EDIT_THROTTLE_MS = 1500;

  const progress: InstallProgress = {
    onStart(_id, _name) { /* initial message already sent */ },
    async onStep(step) {
      const now = Date.now();
      if (now - lastEdit > EDIT_THROTTLE_MS) {
        lastEdit = now;
        try {
          await ctx.api.editMessageText(msg.chat.id, msg.message_id, `⏳ ${nameOrId}: ${step}`);
        } catch { /* rate limit or unchanged */ }
      }
    },
    async onDownloadProgress(percent) {
      const now = Date.now();
      if (now - lastEdit > EDIT_THROTTLE_MS) {
        lastEdit = now;
        try {
          await ctx.api.editMessageText(msg.chat.id, msg.message_id, `⏳ ${nameOrId}: Downloading... ${percent}%`);
        } catch { /* rate limit */ }
      }
    },
    async onSuccess(name) {
      try {
        const keyboard = new InlineKeyboard().text(`Start session with ${name}`, `na:${nameOrId}`);
        await ctx.api.editMessageText(msg.chat.id, msg.message_id, `✅ ${name} installed!`, { reply_markup: keyboard });
      } catch { /* ignore */ }
    },
    async onError(error) {
      try {
        await ctx.api.editMessageText(msg.chat.id, msg.message_id, `❌ ${error}`);
      } catch { /* ignore */ }
    },
  };

  await catalog.install(nameOrId, progress);
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
