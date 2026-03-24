import type { OutgoingMessage } from "../../core/types.js";
import type { FormattedMessage, MessageMetadata } from "./format-types.js";
import { STATUS_ICONS, KIND_ICONS } from "./format-types.js";
import { formatTokens } from "./format-utils.js";

export function extractContentText(content: unknown, depth = 0): string {
  if (!content || depth > 5) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => extractContentText(c, depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof content !== "object") return String(content);

  const obj = content as Record<string, unknown>;
  if (obj.text && typeof obj.text === "string") return obj.text;
  if (obj.content) {
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.content)) {
      return obj.content
        .map((c) => extractContentText(c, depth + 1))
        .filter(Boolean)
        .join("\n");
    }
    return extractContentText(obj.content, depth + 1);
  }
  if (obj.input && typeof obj.input === "string") return obj.input;
  if (obj.output && typeof obj.output === "string") return obj.output;
  return "";
}

export function formatToolSummary(name: string, rawInput: unknown): string {
  let args: Record<string, unknown> = {};
  try {
    if (typeof rawInput === "string") {
      args = JSON.parse(rawInput) as Record<string, unknown>;
    } else if (typeof rawInput === "object" && rawInput !== null) {
      args = rawInput as Record<string, unknown>;
    }
  } catch {
    return `🔧 ${name}`;
  }

  const lowerName = name.toLowerCase();

  if (lowerName === "read") {
    const fp = args.file_path ?? args.filePath ?? "";
    const limit = args.limit ? ` (${args.limit} lines)` : "";
    return fp ? `📖 Read ${fp}${limit}` : `🔧 ${name}`;
  }
  if (lowerName === "edit") {
    const fp = args.file_path ?? args.filePath ?? "";
    return fp ? `✏️ Edit ${fp}` : `🔧 ${name}`;
  }
  if (lowerName === "write") {
    const fp = args.file_path ?? args.filePath ?? "";
    return fp ? `📝 Write ${fp}` : `🔧 ${name}`;
  }
  if (lowerName === "bash") {
    const cmd = String(args.command ?? "").slice(0, 60);
    return cmd ? `▶️ Run: ${cmd}` : `🔧 ${name}`;
  }
  if (lowerName === "grep") {
    const pattern = args.pattern ?? "";
    const path = args.path ?? "";
    return pattern
      ? `🔍 Grep "${pattern}"${path ? ` in ${path}` : ""}`
      : `🔧 ${name}`;
  }
  if (lowerName === "glob") {
    const pattern = args.pattern ?? "";
    return pattern ? `🔍 Glob ${pattern}` : `🔧 ${name}`;
  }
  if (lowerName === "agent") {
    const desc = String(args.description ?? "").slice(0, 60);
    return desc ? `🧠 Agent: ${desc}` : `🔧 ${name}`;
  }
  if (lowerName === "webfetch" || lowerName === "web_fetch") {
    const url = String(args.url ?? "").slice(0, 60);
    return url ? `🌐 Fetch ${url}` : `🔧 ${name}`;
  }
  if (lowerName === "websearch" || lowerName === "web_search") {
    const query = String(args.query ?? "").slice(0, 60);
    return query ? `🌐 Search "${query}"` : `🔧 ${name}`;
  }

  return `🔧 ${name}`;
}

export function formatOutgoingMessage(msg: OutgoingMessage): FormattedMessage {
  const meta = (msg.metadata ?? {}) as Record<string, unknown>;

  switch (msg.type) {
    case "text":
      return {
        summary: msg.text,
        icon: "",
        originalType: "text",
        style: "text",
      };

    case "thought": {
      const full = msg.text;
      const summary = full.length > 80 ? full.slice(0, 80) + "..." : full;
      return {
        summary,
        detail: full.length > 80 ? full : undefined,
        icon: "💭",
        originalType: "thought",
        style: "thought",
      };
    }

    case "tool_call": {
      const name = String(meta.name ?? msg.text ?? "Tool");
      const kind = String(meta.kind ?? "other");
      const status = String(meta.status ?? "pending");
      const rawInput = meta.rawInput;
      const summary = formatToolSummary(name, rawInput);
      const statusIcon = STATUS_ICONS[status] ?? "⏳";
      const detail = extractContentText(meta.content);
      return {
        summary: `${statusIcon} ${summary}`,
        detail: detail || undefined,
        icon: KIND_ICONS[kind] ?? "🔧",
        originalType: "tool_call",
        style: "tool",
        metadata: { toolName: name, toolStatus: status, toolKind: kind },
      };
    }

    case "tool_update": {
      const name = String(meta.name ?? msg.text ?? "Tool");
      const kind = String(meta.kind ?? "other");
      const status = String(meta.status ?? "completed");
      const rawInput = meta.rawInput;
      const summary = formatToolSummary(name, rawInput);
      const statusIcon = STATUS_ICONS[status] ?? "✅";
      const detail = extractContentText(meta.content);
      return {
        summary: `${statusIcon} ${summary}`,
        detail: detail || undefined,
        icon: KIND_ICONS[kind] ?? "🔧",
        originalType: "tool_update",
        style: "tool",
        metadata: { toolName: name, toolStatus: status, toolKind: kind },
      };
    }

    case "plan": {
      const entries = (meta.entries ?? []) as {
        content: string;
        status: string;
      }[];
      return {
        summary: `📋 Plan: ${entries.length} steps`,
        icon: "📋",
        originalType: "plan",
        style: "plan",
        metadata: { planEntries: entries } satisfies MessageMetadata,
      };
    }

    case "usage": {
      const tokens = Number(meta.tokensUsed ?? 0);
      const costObj = meta.cost as
        | { amount?: number; currency?: string }
        | number
        | undefined;
      const costAmount =
        typeof costObj === "number" ? costObj : (costObj?.amount ?? 0);
      const summary = `📊 ${formatTokens(tokens)} tokens${costAmount ? ` · $${costAmount.toFixed(2)}` : ""}`;
      return {
        summary,
        icon: "📊",
        originalType: "usage",
        style: "usage",
        metadata: {
          tokens,
          contextSize: Number(meta.contextSize ?? 0),
          cost: costAmount,
        },
      };
    }

    case "error": {
      const full = msg.text;
      return {
        summary: full.length > 120 ? full.slice(0, 120) + "..." : full,
        detail: full.length > 120 ? full : undefined,
        icon: "❌",
        originalType: "error",
        style: "error",
      };
    }

    case "session_end":
      return {
        summary: `Session ${msg.text}`,
        icon: msg.text.includes("completed") ? "✅" : "❌",
        originalType: "session_end",
        style: "system",
      };

    case "system_message":
      return {
        summary: msg.text,
        icon: "ℹ️",
        originalType: "system_message",
        style: "system",
      };

    case "attachment":
      return {
        summary: msg.text || "File",
        icon: "📎",
        originalType: "attachment",
        style: "attachment",
      };

    default:
      return {
        summary: msg.text || "",
        icon: "",
        originalType: msg.type,
        style: "text",
      };
  }
}
