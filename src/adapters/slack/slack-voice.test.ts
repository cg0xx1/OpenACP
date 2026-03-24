import { describe, expect, it, vi } from "vitest";
import { SlackTextBuffer } from "./text-buffer.js";
import type { ISlackSendQueue } from "./send-queue.js";

function createMockQueue(): ISlackSendQueue {
  return {
    enqueue: vi.fn().mockResolvedValue({ ok: true, ts: "1234567890.123456" }),
  };
}

describe("SlackTextBuffer.stripTtsBlock", () => {
  it("strips TTS block from unflushed buffer", async () => {
    const queue = createMockQueue();
    const buf = new SlackTextBuffer("C1", "s1", queue);

    buf.append("Hello [TTS]speak this[/TTS]");
    await buf.stripTtsBlock();
    await buf.flush();

    // After strip, "Hello" remains; markdownToMrkdwn may adjust formatting
    const call = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("chat.postMessage");
    expect((call[1] as any).text).toBe("Hello");
  });

  it("strips multiline TTS blocks from unflushed buffer", async () => {
    const queue = createMockQueue();
    const buf = new SlackTextBuffer("C1", "s1", queue);

    buf.append("[TTS]line1\nline2\nline3[/TTS] end");
    await buf.stripTtsBlock();
    await buf.flush();

    const call = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("chat.postMessage");
    expect((call[1] as any).text).toBe("end");
  });

  it("is a no-op when no TTS block present", async () => {
    const queue = createMockQueue();
    const buf = new SlackTextBuffer("C1", "s1", queue);

    buf.append("Hello world");
    await buf.stripTtsBlock();
    await buf.flush();

    expect(queue.enqueue).toHaveBeenCalledWith("chat.postMessage", expect.objectContaining({
      text: "Hello world",
    }));
  });

  it("edits already-posted message via chat.update when TTS was flushed", async () => {
    const queue = createMockQueue();
    const buf = new SlackTextBuffer("C1", "s1", queue);

    buf.append("Hello world [TTS]speak this[/TTS]");
    await buf.flush(); // Flush posts the message with TTS block

    // Now strip should edit via chat.update
    await buf.stripTtsBlock();

    // Find the chat.update call
    const updateCall = (queue.enqueue as ReturnType<typeof vi.fn>).mock.calls.find(
      (c: any[]) => c[0] === "chat.update",
    );
    expect(updateCall).toBeDefined();
    expect((updateCall![1] as any).channel).toBe("C1");
    expect((updateCall![1] as any).ts).toBe("1234567890.123456");
    expect((updateCall![1] as any).text).toBe("Hello world");
  });

  it("does not call chat.update when flushed message has no TTS block", async () => {
    const queue = createMockQueue();
    const buf = new SlackTextBuffer("C1", "s1", queue);

    buf.append("Hello world");
    await buf.flush();

    await buf.stripTtsBlock();

    // Only the postMessage call, no chat.update
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith("chat.postMessage", expect.anything());
  });
});

describe("isAudioClip detection", () => {
  // We test the logic inline since isAudioClip is a private method on SlackAdapter.
  // Replicate the detection logic here to test it in isolation.
  function isAudioClip(file: { mimetype: string; name: string }): boolean {
    return (file.mimetype === "video/mp4" && file.name?.startsWith("audio_message")) ||
           file.mimetype?.startsWith("audio/");
  }

  it("detects video/mp4 with audio_message filename as audio", () => {
    expect(isAudioClip({ mimetype: "video/mp4", name: "audio_message_abc.mp4" })).toBe(true);
  });

  it("detects audio/* MIME types as audio", () => {
    expect(isAudioClip({ mimetype: "audio/ogg", name: "recording.ogg" })).toBe(true);
    expect(isAudioClip({ mimetype: "audio/mp4", name: "voice.m4a" })).toBe(true);
    expect(isAudioClip({ mimetype: "audio/mpeg", name: "file.mp3" })).toBe(true);
  });

  it("rejects non-audio video/mp4 files", () => {
    expect(isAudioClip({ mimetype: "video/mp4", name: "screen_recording.mp4" })).toBe(false);
  });

  it("rejects non-audio files", () => {
    expect(isAudioClip({ mimetype: "image/png", name: "screenshot.png" })).toBe(false);
    expect(isAudioClip({ mimetype: "application/pdf", name: "doc.pdf" })).toBe(false);
    expect(isAudioClip({ mimetype: "text/plain", name: "notes.txt" })).toBe(false);
  });
});
