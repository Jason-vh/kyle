import type { WebClient } from "@slack/web-api";
import type { AnyChunk } from "@slack/types";
import { createLogger } from "../logger.ts";

const log = createLogger("slack:stream");

/** Flush buffered text once it reaches this many characters. */
const FLUSH_THRESHOLD = 512;

/** Collapse consecutive tool calls into a single summarized task card. */
const TASK_DISPLAY_MODE = "dense";

export interface StreamTarget {
  channel: string;
  threadTs: string;
  /** Recipient of the stream. Required by Slack when streaming into a channel. */
  userId?: string;
  teamId?: string;
}

export interface TaskUpdate {
  id: string;
  title: string;
  status: "in_progress" | "complete" | "error";
}

/**
 * Streams an agent response into a Slack thread.
 *
 * Text is buffered and flushed in order; tool progress is sent as task chunks.
 * Responses that never reach the flush threshold and streams that fail are
 * delivered as a plain threaded message instead, so text is never lost or
 * duplicated.
 */
export class SlackResponseStream {
  private ts?: string;
  private pending = "";
  private hasText = false;
  private broken = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly slack: WebClient,
    private readonly target: StreamTarget,
  ) {}

  /** Buffer a text delta, flushing once enough has accumulated. */
  appendText(delta: string): void {
    if (!delta) return;
    this.pending += delta;
    this.hasText = true;
    if (this.pending.length >= FLUSH_THRESHOLD) this.enqueue();
  }

  /** Separate this block of text from the previous one. */
  newParagraph(): void {
    if (!this.hasText || this.pending.endsWith("\n\n")) return;
    this.pending += "\n\n";
  }

  /** Show tool progress in the streamed message. */
  updateTask(task: TaskUpdate): void {
    this.enqueue({ type: "task_update", ...task });
  }

  /** Flush what's left and close the message, using fallbackText if nothing streamed. */
  async finish(fallbackText: string): Promise<void> {
    await this.queue;
    const closing = this.pending || (this.hasText ? "" : fallbackText);
    this.pending = "";

    if (!this.ts) {
      await this.post(closing);
      return;
    }

    try {
      await this.slack.chat.stopStream({
        channel: this.target.channel,
        ts: this.ts,
        chunks: closing ? [{ type: "markdown_text", text: closing }] : [],
      });
    } catch (error) {
      log.warn("failed to stop slack stream", { ...this.context(), error: message(error) });
      if (closing) await this.post(closing);
    }
  }

  private enqueue(chunk?: AnyChunk): void {
    this.queue = this.queue.then(() => this.flush(chunk));
  }

  private async flush(chunk?: AnyChunk): Promise<void> {
    if (this.broken) return;

    const text = this.pending;
    const chunks: AnyChunk[] = [];
    if (text) chunks.push({ type: "markdown_text", text });
    if (chunk) chunks.push(chunk);
    if (chunks.length === 0) return;

    try {
      if (this.ts) {
        await this.slack.chat.appendStream({ channel: this.target.channel, ts: this.ts, chunks });
      } else {
        const response = await this.slack.chat.startStream({
          channel: this.target.channel,
          thread_ts: this.target.threadTs,
          recipient_user_id: this.target.userId,
          recipient_team_id: this.target.teamId,
          task_display_mode: TASK_DISPLAY_MODE,
          chunks,
        });
        if (!response.ts) throw new Error("chat.startStream returned no ts");
        this.ts = response.ts;
      }
      // Deltas may have arrived while awaiting, so only drop what was sent.
      this.pending = this.pending.slice(text.length);
    } catch (error) {
      this.broken = true;
      log.warn("slack stream failed, falling back to a plain message", {
        ...this.context(),
        error: message(error),
      });
    }
  }

  private async post(text: string): Promise<void> {
    if (!text) return;
    await this.slack.chat.postMessage({
      channel: this.target.channel,
      thread_ts: this.target.threadTs,
      markdown_text: text,
      unfurl_links: false,
      unfurl_media: false,
    });
  }

  private context() {
    return { channel: this.target.channel, threadTs: this.target.threadTs, ts: this.ts };
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
