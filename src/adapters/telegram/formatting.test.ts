import { describe, it, expect } from "vitest";
import { formatUsage, telegramRenderer } from "./formatting.js";
import type { FormattedMessage } from "../shared/format-types.js";

describe("formatUsage", () => {
  it("shows progress bar with tokens and contextSize", () => {
    // 28k/200k = 14%, Math.round(0.14 * 10) = 1 filled block
    const result = formatUsage({ tokensUsed: 28000, contextSize: 200000 });
    expect(result).toBe("📊 28k / 200k tokens\n▓░░░░░░░░░ 14%");
  });

  it("shows warning emoji when usage >= 85%", () => {
    const result = formatUsage({ tokensUsed: 85000, contextSize: 100000 });
    expect(result).toBe("⚠️ 85k / 100k tokens\n▓▓▓▓▓▓▓▓▓░ 85%");
  });

  it("shows warning emoji at exactly 85%", () => {
    const result = formatUsage({ tokensUsed: 8500, contextSize: 10000 });
    expect(result).toContain("⚠️");
  });

  it("shows 100% with full bar", () => {
    const result = formatUsage({ tokensUsed: 100000, contextSize: 100000 });
    expect(result).toBe("⚠️ 100k / 100k tokens\n▓▓▓▓▓▓▓▓▓▓ 100%");
  });

  it("shows only tokens when no contextSize", () => {
    const result = formatUsage({ tokensUsed: 5000 });
    expect(result).toBe("📊 5k tokens");
  });

  it("shows placeholder when no data", () => {
    const result = formatUsage({});
    expect(result).toBe("📊 Usage data unavailable");
  });

  it("displays small numbers without k suffix", () => {
    const result = formatUsage({ tokensUsed: 500, contextSize: 1000 });
    expect(result).toBe("📊 500 / 1k tokens\n▓▓▓▓▓░░░░░ 50%");
  });
});

describe("telegramRenderer", () => {
  it("renders tool message with bold HTML", () => {
    const msg: FormattedMessage = {
      summary: "⏳ 📖 Read src/main.ts",
      icon: "📖",
      originalType: "tool_call",
      style: "tool",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).toContain("<b>");
    expect(result).toContain("</b>");
    expect(result).not.toContain("**");
  });

  it("renders tool message with detail in <pre> block", () => {
    const msg: FormattedMessage = {
      summary: "✅ ▶️ Run: pnpm test",
      detail: "all 50 tests pass",
      icon: "▶️",
      originalType: "tool_update",
      style: "tool",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).toContain("<pre>");
    expect(result).toContain("all 50 tests pass");
  });

  it("escapes HTML in tool summary", () => {
    const msg: FormattedMessage = {
      summary: "📖 Read <script>alert(1)</script>",
      icon: "📖",
      originalType: "tool_call",
      style: "tool",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
  });

  it("renders thought message with italic HTML", () => {
    const msg: FormattedMessage = {
      summary: "Thinking about the approach",
      icon: "💭",
      originalType: "thought",
      style: "thought",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).toContain("💭");
    expect(result).toContain("<i>");
    expect(result).toContain("</i>");
  });

  it("renders text message as-is (no wrapping)", () => {
    const msg: FormattedMessage = {
      summary: "Hello world",
      icon: "",
      originalType: "text",
      style: "text",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).toBe("Hello world");
  });

  it("renderFull returns summary", () => {
    const msg: FormattedMessage = {
      summary: "Summary text",
      icon: "📊",
      originalType: "usage",
      style: "usage",
    };
    expect(telegramRenderer.renderFull(msg)).toBe("Summary text");
  });

  it("truncates tool detail at 3800 chars", () => {
    const msg: FormattedMessage = {
      summary: "✅ Read file",
      detail: "x".repeat(5000),
      icon: "📖",
      originalType: "tool_update",
      style: "tool",
    };
    const result = telegramRenderer.render(msg, false);
    expect(result).toContain("… (truncated)");
  });
});
