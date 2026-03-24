import { describe, it, expect } from "vitest";
import {
  extractContentText,
  formatToolSummary,
  formatOutgoingMessage,
} from "./message-formatter.js";
import type { OutgoingMessage } from "../../core/types.js";

describe("extractContentText", () => {
  it("returns string content as-is", () => {
    expect(extractContentText("hello")).toBe("hello");
  });
  it("extracts text from ACP content block", () => {
    expect(extractContentText({ type: "text", text: "hello world" })).toBe(
      "hello world",
    );
  });
  it("handles nested content arrays", () => {
    const block = {
      content: [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ],
    };
    expect(extractContentText(block)).toContain("a");
    expect(extractContentText(block)).toContain("b");
  });
  it("handles top-level array of content blocks", () => {
    const arr = [
      { type: "text", text: "hello" },
      { type: "text", text: "world" },
    ];
    expect(extractContentText(arr)).toBe("hello\nworld");
  });
  it("returns empty string for null/undefined", () => {
    expect(extractContentText(null)).toBe("");
    expect(extractContentText(undefined)).toBe("");
  });
  it("extracts input/output fields", () => {
    expect(extractContentText({ input: "some input" })).toBe("some input");
    expect(extractContentText({ output: "some output" })).toBe("some output");
  });
  it("respects depth limit", () => {
    let nested: Record<string, unknown> = { text: "deep" };
    for (let i = 0; i < 10; i++) nested = { content: nested };
    // Should return empty at depth > 5
    expect(extractContentText(nested).length).toBeLessThan(10);
  });
});

describe("formatToolSummary", () => {
  it("summarizes Read tool", () => {
    expect(
      formatToolSummary(
        "Read",
        JSON.stringify({ file_path: "src/main.ts", limit: 50 }),
      ),
    ).toBe("📖 Read src/main.ts (50 lines)");
  });
  it("summarizes Read tool without limit", () => {
    expect(
      formatToolSummary("Read", JSON.stringify({ file_path: "src/main.ts" })),
    ).toBe("📖 Read src/main.ts");
  });
  it("summarizes Bash tool", () => {
    expect(
      formatToolSummary("Bash", JSON.stringify({ command: "pnpm test" })),
    ).toBe("▶️ Run: pnpm test");
  });
  it("truncates long Bash commands", () => {
    const cmd = "a".repeat(100);
    const result = formatToolSummary("Bash", JSON.stringify({ command: cmd }));
    expect(result.length).toBeLessThan(80);
  });
  it("summarizes Edit tool", () => {
    expect(
      formatToolSummary("Edit", JSON.stringify({ file_path: "src/app.ts" })),
    ).toBe("✏️ Edit src/app.ts");
  });
  it("summarizes Write tool", () => {
    expect(
      formatToolSummary("Write", JSON.stringify({ file_path: "new-file.ts" })),
    ).toBe("✏️ Write new-file.ts");
  });
  it("summarizes Grep tool", () => {
    expect(
      formatToolSummary(
        "Grep",
        JSON.stringify({ pattern: "TODO", path: "src/" }),
      ),
    ).toBe('🔍 Grep "TODO" in src/');
  });
  it("summarizes Glob tool", () => {
    expect(
      formatToolSummary("Glob", JSON.stringify({ pattern: "**/*.ts" })),
    ).toBe("🔍 Glob **/*.ts");
  });
  it("summarizes Agent tool", () => {
    expect(
      formatToolSummary(
        "Agent",
        JSON.stringify({ description: "Search codebase" }),
      ),
    ).toBe("🧠 Agent: Search codebase");
  });
  it("summarizes WebFetch tool", () => {
    expect(
      formatToolSummary(
        "WebFetch",
        JSON.stringify({ url: "https://api.example.com" }),
      ),
    ).toBe("🌐 Fetch https://api.example.com");
  });
  it("summarizes WebSearch tool", () => {
    expect(
      formatToolSummary(
        "WebSearch",
        JSON.stringify({ query: "react markdown" }),
      ),
    ).toBe('🌐 Search "react markdown"');
  });
  it("falls back for unknown tools", () => {
    expect(formatToolSummary("CustomTool", "{}")).toBe("🔧 CustomTool");
  });
  it("handles non-JSON content gracefully", () => {
    expect(formatToolSummary("Read", "some raw text")).toBe("🔧 Read");
  });
  it("handles object input (not just string)", () => {
    expect(formatToolSummary("Read", { file_path: "test.ts" })).toBe(
      "📖 Read test.ts",
    );
  });
});

describe("formatOutgoingMessage", () => {
  it("formats text message", () => {
    const msg: OutgoingMessage = { type: "text", text: "Hello world" };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("text");
    expect(result.summary).toBe("Hello world");
    expect(result.originalType).toBe("text");
    expect(result.icon).toBe("");
  });

  it("formats thought message — short", () => {
    const msg: OutgoingMessage = { type: "thought", text: "Short thought" };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("thought");
    expect(result.icon).toBe("💭");
    expect(result.summary).toBe("Short thought");
    expect(result.detail).toBeUndefined();
  });

  it("formats thought message — long truncates to 80 chars", () => {
    const long = "a".repeat(150);
    const msg: OutgoingMessage = { type: "thought", text: long };
    const result = formatOutgoingMessage(msg);
    expect(result.summary.length).toBeLessThanOrEqual(83);
    expect(result.summary).toContain("...");
    expect(result.detail).toBe(long);
  });

  it("formats tool_call with smart summary", () => {
    const msg: OutgoingMessage = {
      type: "tool_call",
      text: "Read",
      metadata: {
        name: "Read",
        kind: "read",
        status: "in_progress",
        rawInput: JSON.stringify({ file_path: "src/main.ts" }),
      },
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("tool");
    expect(result.originalType).toBe("tool_call");
    expect(result.summary).toContain("src/main.ts");
    expect(result.summary).toContain("🔄"); // in_progress status
    expect(result.icon).toBe("📖"); // read kind
    expect(result.metadata?.toolName).toBe("Read");
    expect(result.metadata?.toolStatus).toBe("in_progress");
  });

  it("formats tool_update with completed status", () => {
    const msg: OutgoingMessage = {
      type: "tool_update",
      text: "",
      metadata: {
        name: "Bash",
        kind: "execute",
        status: "completed",
        rawInput: JSON.stringify({ command: "pnpm test" }),
        content: "all tests pass",
      },
    };
    const result = formatOutgoingMessage(msg);
    expect(result.originalType).toBe("tool_update");
    expect(result.summary).toContain("✅");
    expect(result.summary).toContain("pnpm test");
    expect(result.detail).toBe("all tests pass");
  });

  it("formats plan message", () => {
    const msg: OutgoingMessage = {
      type: "plan",
      text: "",
      metadata: {
        entries: [
          { content: "Step 1", status: "completed" },
          { content: "Step 2", status: "pending" },
        ],
      },
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("plan");
    expect(result.summary).toContain("2 steps");
    expect(result.metadata?.planEntries).toHaveLength(2);
  });

  it("formats usage message with cost object", () => {
    const msg: OutgoingMessage = {
      type: "usage",
      text: "",
      metadata: {
        tokensUsed: 12345,
        contextSize: 50000,
        cost: { amount: 0.04, currency: "USD" },
      },
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("usage");
    expect(result.summary).toContain("12k");
    expect(result.summary).toContain("$0.04");
  });

  it("formats usage message with numeric cost", () => {
    const msg: OutgoingMessage = {
      type: "usage",
      text: "",
      metadata: { tokensUsed: 500, cost: 0.01 },
    };
    const result = formatOutgoingMessage(msg);
    expect(result.summary).toContain("500");
    expect(result.summary).toContain("$0.01");
  });

  it("formats error message — short", () => {
    const msg: OutgoingMessage = {
      type: "error",
      text: "Something went wrong",
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("error");
    expect(result.icon).toBe("❌");
    expect(result.detail).toBeUndefined();
  });

  it("formats error message — long truncates", () => {
    const long = "x".repeat(200);
    const msg: OutgoingMessage = { type: "error", text: long };
    const result = formatOutgoingMessage(msg);
    expect(result.summary.length).toBeLessThanOrEqual(123);
    expect(result.detail).toBe(long);
  });

  it("formats session_end completed", () => {
    const msg: OutgoingMessage = {
      type: "session_end",
      text: "Done (completed)",
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("system");
    expect(result.originalType).toBe("session_end");
  });

  it("formats system_message", () => {
    const msg: OutgoingMessage = {
      type: "system_message",
      text: "System info",
    };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("system");
    expect(result.icon).toBe("ℹ️");
  });

  it("formats attachment", () => {
    const msg: OutgoingMessage = { type: "attachment", text: "image.png" };
    const result = formatOutgoingMessage(msg);
    expect(result.style).toBe("attachment");
    expect(result.icon).toBe("📎");
  });
});
