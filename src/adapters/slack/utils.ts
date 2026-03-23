// src/adapters/slack/utils.ts
// Shared utilities for Slack adapter modules.

const SECTION_LIMIT = 3000;

/**
 * Split text at `limit` boundary, never inside a fenced code block.
 * Used by SlackFormatter and SlackTextBuffer to avoid exceeding Slack's
 * 3000-char section limit.
 */
export function splitSafe(text: string, limit = SECTION_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= limit) { chunks.push(remaining); break; }
    let cut = remaining.lastIndexOf("\n", limit);
    if (cut <= 0) cut = limit;
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut).trimStart();
  }
  return chunks;
}
