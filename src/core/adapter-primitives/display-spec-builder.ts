// src/core/adapter-primitives/display-spec-builder.ts

import { KIND_ICONS, STATUS_ICONS } from "./format-types.js";
import type { OutputMode, ViewerLinks } from "./format-types.js";
import type { ToolEntry } from "./stream-accumulator.js";

// ─── Output spec interfaces ────────────────────────────────────────────────

export interface ToolDisplaySpec {
  id: string;
  icon: string;
  title: string;
  description: string | null;
  command: string | null;
  outputSummary: string | null;
  outputContent: string | null;
  diffStats: { added: number; removed: number } | null;
  viewerLinks?: ViewerLinks;
  outputViewerLink?: string;
  outputFallbackContent?: string;
  status: string;
  isNoise: boolean;
  isHidden: boolean;
}

export interface ThoughtDisplaySpec {
  indicator: string;
  content: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────

/** Kinds that have a runnable command in rawInput.command */
const EXECUTE_KINDS = new Set(["execute", "bash", "command", "terminal"]);

const INLINE_MAX_LINES = 15;
const INLINE_MAX_CHARS = 800;

// ─── Helpers ──────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildTitle(entry: ToolEntry): string {
  // Explicit overrides take highest priority
  if (entry.displayTitle) return entry.displayTitle;
  if (entry.displaySummary) return entry.displaySummary;

  const input = asRecord(entry.rawInput);
  const kind = entry.kind;

  if (kind === "read") {
    const filePath = typeof input.file_path === "string" ? input.file_path : null;
    if (filePath) {
      const start = typeof input.start_line === "number" ? input.start_line : null;
      const end = typeof input.end_line === "number" ? input.end_line : null;
      if (start !== null && end !== null) return `${filePath}:${start}-${end}`;
      if (start !== null) return `${filePath}:${start}`;
      return filePath;
    }
    return entry.name;
  }

  if (kind === "edit" || kind === "write" || kind === "delete") {
    const filePath =
      typeof input.file_path === "string"
        ? input.file_path
        : typeof input.path === "string"
          ? input.path
          : null;
    if (filePath) return filePath;
    return entry.name;
  }

  if (EXECUTE_KINDS.has(kind)) {
    const description = typeof input.description === "string" ? input.description : null;
    if (description) return description;
    const command = typeof input.command === "string" ? input.command : null;
    if (command) return command.length > 60 ? command.slice(0, 57) + "..." : command;
    return entry.name;
  }

  if (kind === "search") {
    const pattern =
      typeof input.pattern === "string"
        ? input.pattern
        : typeof input.query === "string"
          ? input.query
          : null;
    if (pattern) return `${entry.name} "${pattern}"`;
    return entry.name;
  }

  return entry.name;
}

function buildOutputSummary(content: string): string {
  const lines = content.split("\n").length;
  return `${lines} line${lines === 1 ? "" : "s"} of output`;
}

function isShortOutput(content: string): boolean {
  return content.split("\n").length <= INLINE_MAX_LINES && content.length <= INLINE_MAX_CHARS;
}

// ─── DisplaySpecBuilder ───────────────────────────────────────────────────

export class DisplaySpecBuilder {
  buildToolSpec(entry: ToolEntry, mode: OutputMode): ToolDisplaySpec {
    const icon = KIND_ICONS[entry.kind] ?? KIND_ICONS["other"] ?? "🛠️";
    const title = buildTitle(entry);
    const isHidden = entry.isNoise && mode !== "high";

    // Fields that are always null on low
    const includeMeta = mode !== "low";

    const input = asRecord(entry.rawInput);

    const description = includeMeta
      ? typeof input.description === "string"
        ? input.description
        : null
      : null;

    const command =
      includeMeta && EXECUTE_KINDS.has(entry.kind)
        ? typeof input.command === "string"
          ? input.command
          : null
        : null;

    const content = entry.content;

    let outputSummary: string | null = null;
    let outputContent: string | null = null;

    if (content && content.trim().length > 0) {
      if (includeMeta) {
        outputSummary = buildOutputSummary(content);
      }
      if (mode === "high" && isShortOutput(content)) {
        outputContent = content;
      }
    }

    const diffStats = includeMeta ? (entry.diffStats ?? null) : null;

    // outputViewerLink and outputFallbackContent populated in Task 6 (ViewerStore integration)
    return {
      id: entry.id,
      icon,
      title,
      description,
      command,
      outputSummary,
      outputContent,
      diffStats,
      viewerLinks: entry.viewerLinks,
      outputViewerLink: undefined,
      outputFallbackContent: undefined,
      status: entry.status,
      isNoise: entry.isNoise,
      isHidden,
    };
  }

  buildThoughtSpec(content: string, mode: OutputMode): ThoughtDisplaySpec {
    const indicator = STATUS_ICONS["in_progress"] ?? "🔄";
    return {
      indicator,
      content: mode === "high" ? content : null,
    };
  }
}
