// src/core/adapter-primitives/__tests__/display-spec-builder.test.ts
import { describe, it, expect } from "vitest";
import { DisplaySpecBuilder } from "../display-spec-builder.js";
import type { ToolEntry } from "../stream-accumulator.js";

function makeEntry(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    id: "t1",
    name: "Bash",
    kind: "execute",
    rawInput: { command: "pnpm build", description: "Build TypeScript" },
    content: "Done in 2.5s",
    status: "completed",
    isNoise: false,
    ...overrides,
  };
}

const builder = new DisplaySpecBuilder();

describe("DisplaySpecBuilder.buildToolSpec", () => {
  describe("low mode", () => {
    it("returns title only, no description, no command, no output", () => {
      const spec = builder.buildToolSpec(makeEntry(), "low");
      expect(spec.title).toBeTruthy();
      expect(spec.description).toBeNull();
      expect(spec.command).toBeNull();
      expect(spec.outputContent).toBeNull();
      expect(spec.outputSummary).toBeNull();
    });

    it("marks noise tools as hidden", () => {
      const spec = builder.buildToolSpec(makeEntry({ isNoise: true }), "low");
      expect(spec.isHidden).toBe(true);
    });

    it("does not hide noise tools on high", () => {
      const spec = builder.buildToolSpec(makeEntry({ isNoise: true }), "high");
      expect(spec.isHidden).toBe(false);
    });
  });

  describe("medium mode", () => {
    it("includes description and command for execute kind", () => {
      const spec = builder.buildToolSpec(makeEntry(), "medium");
      expect(spec.description).toBe("Build TypeScript");
      expect(spec.command).toBe("pnpm build");
    });

    it("includes outputSummary when content present", () => {
      const spec = builder.buildToolSpec(makeEntry({ content: "line1\nline2\nline3" }), "medium");
      expect(spec.outputSummary).toMatch(/3 lines/);
    });

    it("does not include inline outputContent (medium never inline)", () => {
      const spec = builder.buildToolSpec(makeEntry({ content: "short" }), "medium");
      expect(spec.outputContent).toBeNull();
    });
  });

  describe("high mode", () => {
    it("includes inline outputContent for short output (≤15 lines, ≤800 chars)", () => {
      const spec = builder.buildToolSpec(makeEntry({ content: "Done in 2.5s" }), "high");
      expect(spec.outputContent).toBe("Done in 2.5s");
    });

    it("does NOT include inline outputContent for long output (>15 lines)", () => {
      const longOutput = Array.from({ length: 20 }, (_, i) => `line ${i}`).join("\n");
      const spec = builder.buildToolSpec(makeEntry({ content: longOutput }), "high");
      expect(spec.outputContent).toBeNull();
    });

    it("does NOT include inline outputContent for long output (>800 chars)", () => {
      const longOutput = "x".repeat(801);
      const spec = builder.buildToolSpec(makeEntry({ content: longOutput }), "high");
      expect(spec.outputContent).toBeNull();
    });

    it("includes inline outputContent at exactly 15 lines (boundary)", () => {
      const content = Array.from({ length: 15 }, (_, i) => `line ${i}`).join("\n");
      const spec = builder.buildToolSpec(makeEntry({ content }), "high");
      expect(spec.outputContent).toBe(content);
    });

    it("includes inline outputContent at exactly 800 chars (boundary)", () => {
      const content = "x".repeat(800);
      const spec = builder.buildToolSpec(makeEntry({ content }), "high");
      expect(spec.outputContent).toBe(content);
    });

    it("non-noise tool is never hidden regardless of mode", () => {
      expect(builder.buildToolSpec(makeEntry({ isNoise: false }), "low").isHidden).toBe(false);
      expect(builder.buildToolSpec(makeEntry({ isNoise: false }), "medium").isHidden).toBe(false);
      expect(builder.buildToolSpec(makeEntry({ isNoise: false }), "high").isHidden).toBe(false);
    });
  });

  describe("thought spec", () => {
    it("returns content null on low/medium", () => {
      expect(builder.buildThoughtSpec("thinking", "low").content).toBeNull();
      expect(builder.buildThoughtSpec("thinking", "medium").content).toBeNull();
    });

    it("returns content on high", () => {
      expect(builder.buildThoughtSpec("thinking hard", "high").content).toBe("thinking hard");
    });
  });

  describe("Read tool — no command field", () => {
    it("extracts description from rawInput.description, no command", () => {
      const entry = makeEntry({
        name: "Read",
        kind: "read",
        rawInput: { file_path: "src/foo.ts", description: "Read foo" },
      });
      const spec = builder.buildToolSpec(entry, "medium");
      expect(spec.description).toBe("Read foo");
      expect(spec.command).toBeNull();
    });
  });

  describe("diffStats", () => {
    it("includes diffStats from entry on medium+", () => {
      const entry = makeEntry({ diffStats: { added: 10, removed: 3 } });
      const spec = builder.buildToolSpec(entry, "medium");
      expect(spec.diffStats).toEqual({ added: 10, removed: 3 });
    });

    it("diffStats is null on low", () => {
      const entry = makeEntry({ diffStats: { added: 10, removed: 3 } });
      const spec = builder.buildToolSpec(entry, "low");
      expect(spec.diffStats).toBeNull();
    });
  });
});
