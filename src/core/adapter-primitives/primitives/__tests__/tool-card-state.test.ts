import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ToolCardState } from "../tool-card-state.js";
import type { ToolDisplaySpec } from "../../display-spec-builder.js";

function makeSpec(
  id: string,
  title: string,
  overrides?: Partial<ToolDisplaySpec>,
): ToolDisplaySpec {
  return {
    id,
    icon: "",
    title,
    description: null,
    command: null,
    outputSummary: null,
    outputContent: null,
    diffStats: null,
    status: "running",
    isNoise: false,
    isHidden: false,
    ...overrides,
  };
}

describe("ToolCardState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("updateFromSpec appends entry and calls onFlush immediately", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    expect(onFlush).toHaveBeenCalledTimes(1);
    const snapshot = onFlush.mock.calls[0][0];
    expect(snapshot.specs).toHaveLength(1);
    expect(snapshot.specs[0].id).toBe("t1");
    expect(snapshot.specs[0].isHidden).toBe(false);
    card.destroy();
  });

  it("subsequent updateFromSpec calls debounce 500ms", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    expect(onFlush).toHaveBeenCalledTimes(1);
    card.updateFromSpec(makeSpec("t2", "Edit"));
    expect(onFlush).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(500);
    expect(onFlush).toHaveBeenCalledTimes(2);
    card.destroy();
  });

  it("updateFromSpec with same id updates existing entry status and viewerLinks", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    card.updateFromSpec(
      makeSpec("t1", "Read", {
        status: "completed",
        viewerLinks: { file: "http://example.com/file" },
      }),
    );
    vi.advanceTimersByTime(500);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.specs[0].status).toBe("completed");
    expect(snapshot.specs[0].viewerLinks).toEqual({ file: "http://example.com/file" });
    card.destroy();
  });

  it("specs with isHidden:true are excluded from totalVisible", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    // noise tools (isHidden: true)
    card.updateFromSpec(makeSpec("t1", "ls", { isHidden: true, isNoise: true }));
    card.updateFromSpec(makeSpec("t2", "Grep", { isHidden: true, isNoise: true }));
    // visible tool (isHidden: false)
    card.updateFromSpec(makeSpec("t3", "Read", { isHidden: false }));
    vi.advanceTimersByTime(500);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.specs[0].isHidden).toBe(true);
    expect(snapshot.specs[1].isHidden).toBe(true);
    expect(snapshot.specs[2].isHidden).toBe(false);
    card.destroy();
  });

  it("specs with isHidden:false are all visible", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "ls", { isHidden: false }));
    card.updateFromSpec(makeSpec("t2", "Grep", { isHidden: false }));
    vi.advanceTimersByTime(500);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.specs[0].isHidden).toBe(false);
    expect(snapshot.specs[1].isHidden).toBe(false);
    card.destroy();
  });

  it("updatePlan sets plan entries", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    card.updatePlan([
      { content: "Step 1", status: "completed", priority: "high" },
      { content: "Step 2", status: "in_progress", priority: "medium" },
    ]);
    vi.advanceTimersByTime(500);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.planEntries).toHaveLength(2);
    card.destroy();
  });

  it("appendUsage sets usage and schedules flush", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    onFlush.mockClear();
    card.appendUsage({ tokensUsed: 5000, cost: 0.05 });
    vi.advanceTimersByTime(500);
    expect(onFlush).toHaveBeenCalledTimes(1);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.usage).toEqual({ tokensUsed: 5000, cost: 0.05 });
    card.destroy();
  });

  it("finalize force flushes immediately without debounce", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "Read"));
    onFlush.mockClear();
    card.finalize();
    // finalize should flush immediately, without waiting for debounce timer
    expect(onFlush).toHaveBeenCalledTimes(1);
    card.destroy();
  });

  it("totalVisible excludes hidden specs", () => {
    const onFlush = vi.fn();
    const card = new ToolCardState({ onFlush });
    card.updateFromSpec(makeSpec("t1", "ls", { isHidden: true, isNoise: true }));
    card.updateFromSpec(makeSpec("t2", "Read", { isHidden: false }));
    card.updateFromSpec(makeSpec("t3", "Glob", { isHidden: true, isNoise: true }));
    card.updateFromSpec(makeSpec("t4", "Edit", { isHidden: false }));
    vi.advanceTimersByTime(500);
    const snapshot = onFlush.mock.lastCall![0];
    expect(snapshot.totalVisible).toBe(2);
    card.destroy();
  });
});
