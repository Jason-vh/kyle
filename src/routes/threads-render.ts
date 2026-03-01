import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ToolCall,
} from "@mariozechner/pi-ai";
import type { WebhookNotification } from "../db/webhook-notifications.ts";
import type { MediaRefRow } from "../db/media-refs.ts";
import {
  escapeHtml,
  CSS_PALETTE,
  RELATIVE_TIME_JS,
  SLACK_ICON,
  DISCORD_ICON,
  SHARE_ICON,
} from "./threads-utils.ts";

const SONARR_HOST = process.env.SONARR_HOST;
const RADARR_HOST = process.env.RADARR_HOST;

type Message = UserMessage | AssistantMessage | ToolResultMessage;

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

const AVATAR_COLORS = [
  "#60a5fa",
  "#34d399",
  "#f87171",
  "#fbbf24",
  "#a78bfa",
  "#22d3ee",
  "#fb923c",
  "#e879f9",
];

function avatarColor(name: string): string {
  const cp = name.codePointAt(0) ?? 0;
  return AVATAR_COLORS[cp % AVATAR_COLORS.length]!;
}

function avatarLetter(name: string): string {
  const first = String.fromCodePoint(name.codePointAt(0) ?? 63); // '?' fallback
  return /\p{L}/u.test(first) ? first.toUpperCase() : "?";
}

function userAvatar(name: string): string {
  const color = avatarColor(name);
  const letter = escapeHtml(avatarLetter(name));
  return `<div class="avatar" style="background:${color}">${letter}</div>`;
}

const KYLE_AVATAR = `<div class="avatar avatar-kyle">K</div>`;

// ---------------------------------------------------------------------------
// Minimal markdown renderer
// ---------------------------------------------------------------------------

function formatSlackLinks(escaped: string): string {
  return escaped.replace(/&lt;(https?:\/\/[^|]+)\|(.+?)&gt;/g, (_, url, label) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
}

function renderMarkdown(raw: string): string {
  const escaped = escapeHtml(raw);

  // 1. Extract fenced code blocks
  const codeBlocks: string[] = [];
  let text = escaped.replace(/```(\w*)\n([\s\S]*?)```/g, (_, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code>${code}</code></pre>`);
    return `@@CODE_${idx}@@`;
  });

  // 2. Extract inline code
  const inlineCode: string[] = [];
  text = text.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = inlineCode.length;
    inlineCode.push(`<code>${code}</code>`);
    return `@@INLINE_${idx}@@`;
  });

  // 3. Bold
  text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");

  // 4. Italic
  text = text.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

  // 5. Slack mrkdwn links — must run before bare URL linkification
  text = formatSlackLinks(text);

  // 6. Markdown links [text](url)
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, (_, label, url) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });

  // 7. Bare URLs (not already inside an href="...")
  text = text.replace(/(?<!")https?:\/\/[^\s<&)]+(?:&amp;[^\s<&)]+)*/g, (url) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
  });

  // 8. Unordered lists: lines starting with "- "
  text = text.replace(/(^|\n)(- .+(?:\n- .+)*)/g, (_, prefix, block) => {
    const items = block
      .split("\n")
      .map((line: string) => `<li>${line.slice(2)}</li>`)
      .join("");
    return `${prefix}<ul>${items}</ul>`;
  });

  // 9. Paragraphs — split on double newlines
  text = text
    .split(/\n{2,}/)
    .map((p: string) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      // Don't wrap block elements
      if (
        trimmed.startsWith("<ul>") ||
        trimmed.startsWith("@@CODE_") ||
        trimmed.startsWith("<pre>")
      )
        return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
    })
    .join("");

  // 10. Restore code blocks and inline code
  text = text.replace(/@@CODE_(\d+)@@/g, (_, idx) => codeBlocks[parseInt(idx)]!);
  text = text.replace(/@@INLINE_(\d+)@@/g, (_, idx) => inlineCode[parseInt(idx)]!);

  return text;
}

// ---------------------------------------------------------------------------
// Tool call summaries
// ---------------------------------------------------------------------------

function toolSummary(tc: ToolCall): { text: string } {
  const a = tc.arguments as Record<string, unknown>;
  switch (tc.name) {
    // TMDB
    case "search_tmdb_movies":
      return { text: `Searched TMDB movies for '${a.query}'` };
    case "search_tmdb_series":
      return { text: `Searched TMDB series for '${a.query}'` };
    case "search_tmdb":
      return { text: `Searched TMDB for '${a.query}'` };
    case "get_tmdb_movie_details":
      return { text: `Fetched TMDB movie details` };
    case "get_tmdb_series_details":
      return { text: `Fetched TMDB series details` };

    // Sonarr
    case "get_all_series":
      return { text: "Checked TV library" };
    case "get_series_by_id":
      return { text: "Fetched series details" };
    case "search_series":
      return { text: `Searched for series '${a.title}'` };
    case "add_series":
      return { text: "Added series to Sonarr" };
    case "remove_series":
      return { text: "Removed series from Sonarr" };
    case "remove_season":
      return { text: "Removed season from Sonarr" };
    case "get_episodes":
      return { text: "Fetched episode list" };
    case "get_series_queue":
      return { text: "Checked download queue (TV)" };
    case "get_calendar":
      return { text: "Checked upcoming episodes" };
    case "search_episodes":
      return { text: "Searched for missing episodes" };
    case "get_series_history":
      return { text: "Checked series history" };

    // Radarr
    case "get_all_movies":
      return { text: "Checked movie library" };
    case "get_radarr_movie":
      return { text: "Fetched movie details" };
    case "search_movies":
      return { text: `Searched for movie '${a.title}'` };
    case "add_movie":
      return { text: "Added movie to Radarr" };
    case "remove_movie":
      return { text: "Removed movie from Radarr" };
    case "get_movie_queue":
      return { text: "Checked download queue (movies)" };
    case "get_movie_history":
      return { text: "Checked movie history" };

    // Ultra / qBittorrent
    case "get_ultra_stats":
      return { text: "Checked seedbox stats" };
    case "get_torrents":
      return { text: "Listed torrents" };
    case "delete_torrents":
      return { text: "Deleted torrents" };

    // Brave
    case "web_search":
      return { text: `Searched the web for '${a.query}'` };

    default:
      return { text: tc.name.replace(/_/g, " ") };
  }
}

// ---------------------------------------------------------------------------
// Pretty print JSON helper
// ---------------------------------------------------------------------------

function prettyPrint(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

// ---------------------------------------------------------------------------
// Permalink helper
// ---------------------------------------------------------------------------

function permalink(id: string): string {
  return `<a href="#${id}" class="permalink" onclick="copyPermalink('${id}')" title="Copy link">#</a>`;
}

// ---------------------------------------------------------------------------
// Timestamp helper
// ---------------------------------------------------------------------------

function formatISOTime(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function timeTag(date: Date): string {
  return `<time datetime="${date.toISOString()}">${escapeHtml(formatISOTime(date))}</time>`;
}

// ---------------------------------------------------------------------------
// Date separator
// ---------------------------------------------------------------------------

function dateSeparator(date: Date): string {
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
  return `<div class="date-separator"><span>${escapeHtml(label)}</span></div>`;
}

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Render individual message types
// ---------------------------------------------------------------------------

function renderUserMessage(
  msg: UserMessage,
  username: string,
  id: string,
  createdAt: Date,
): string {
  let text: string;
  if (typeof msg.content === "string") {
    text = msg.content;
  } else {
    text = msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return `<div class="message user" id="${id}">
  ${userAvatar(username)}
  <div class="message-body">
    <div class="message-header">
      <span class="username">${escapeHtml(username)}</span>
      ${timeTag(createdAt)}
    </div>
    <div class="content">${renderMarkdown(text)}</div>
  </div>
  ${permalink(id)}
</div>`;
}

function renderToolUseMessage(
  msg: AssistantMessage,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
  createdAt: Date,
): string {
  const toolCalls = msg.content.filter((b): b is ToolCall => b.type === "toolCall");
  const hasErrors = toolCalls.some((tc) => resultMap.get(tc.id)?.isError);

  // Summary lines (visible in collapsed state)
  const thinkingParts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text" && block.text.trim()) {
      thinkingParts.push(`<div class="tool-thinking">${renderMarkdown(block.text)}</div>`);
    }
  }

  const summaryLines: string[] = [];
  for (const tc of toolCalls) {
    const isError = resultMap.get(tc.id)?.isError ?? false;
    const summary = toolSummary(tc);
    const statusIcon = isError
      ? '<span class="tool-status tool-status-error" title="Error"></span>'
      : '<span class="tool-status tool-status-ok" title="Success"></span>';
    summaryLines.push(`<div class="tool-summary-row">
      ${statusIcon}
      <span class="tool-summary-text">${escapeHtml(summary.text)}</span>
    </div>`);
  }

  // Detail sections (shown when expanded)
  const detailParts: string[] = [];
  for (const tc of toolCalls) {
    const result = resultMap.get(tc.id);
    const isError = result?.isError ?? false;
    const args = JSON.stringify(tc.arguments, null, 2);
    let resultHtml = "";
    if (result) {
      const text = result.content
        .filter((c): c is TextContent => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      const formatted = prettyPrint(text);
      resultHtml = `<div class="tool-detail-section">
          <div class="tool-detail-label">Output${isError ? " (error)" : ""}</div>
          <pre class="${isError ? "tool-error" : ""}">${escapeHtml(formatted)}</pre>
        </div>`;
    }
    detailParts.push(`<div class="tool-detail-group">
      <div class="tool-detail-section">
        <div class="tool-detail-label">${escapeHtml(tc.name)} — Input</div>
        <pre>${escapeHtml(args)}</pre>
      </div>
      ${resultHtml}
    </div>`);
  }

  return `<details class="message tool-use" id="${id}"${hasErrors ? " open" : ""}>
  <summary class="tool-use-summary">
    ${KYLE_AVATAR}
    <div class="message-body">
      <div class="message-header">
        <span class="username">Kyle</span>
        ${timeTag(createdAt)}
      </div>
      ${thinkingParts.join("\n")}
      ${summaryLines.join("\n")}
    </div>
    ${permalink(id)}
  </summary>
  <div class="tool-details-content">
    ${detailParts.join("\n")}
  </div>
</details>`;
}

function renderErrorMessage(msg: AssistantMessage, id: string, createdAt: Date): string {
  const errorText = msg.errorMessage ? prettyPrint(msg.errorMessage) : "Error processing message";
  // Try to extract a human-readable message
  let friendlyMsg = "Something went wrong while processing this message.";
  if (msg.errorMessage) {
    try {
      const parsed = JSON.parse(msg.errorMessage);
      if (parsed.error?.message) friendlyMsg = parsed.error.message;
      else if (typeof parsed.message === "string") friendlyMsg = parsed.message;
    } catch {
      if (msg.errorMessage.length < 200) friendlyMsg = msg.errorMessage;
    }
  }

  return `<div class="message error-card" id="${id}">
  ${KYLE_AVATAR}
  <div class="message-body">
    <div class="message-header">
      <span class="username">Kyle</span>
      ${timeTag(createdAt)}
    </div>
    <div class="error-friendly">${escapeHtml(friendlyMsg)}</div>
    <details class="error-raw">
      <summary>Raw error</summary>
      <pre>${escapeHtml(errorText)}</pre>
    </details>
  </div>
  ${permalink(id)}
</div>`;
}

function renderAssistantTextMessage(
  msg: AssistantMessage,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
  createdAt: Date,
): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      parts.push(`<div class="content">${renderMarkdown(block.text)}</div>`);
    } else if (block.type === "toolCall") {
      // Shouldn't happen for endTurn, but handle gracefully
      const result = resultMap.get(block.id);
      const isError = result?.isError ?? false;
      const summary = toolSummary(block);
      const statusIcon = isError
        ? '<span class="tool-status tool-status-error"></span>'
        : '<span class="tool-status tool-status-ok"></span>';
      parts.push(
        `<div class="tool-summary-row">${statusIcon}<span class="tool-summary-text">${escapeHtml(summary.text)}</span></div>`,
      );
    }
  }

  return `<div class="message assistant" id="${id}">
  ${KYLE_AVATAR}
  <div class="message-body">
    <div class="message-header">
      <span class="username">Kyle</span>
      ${timeTag(createdAt)}
    </div>
    ${parts.join("\n")}
  </div>
  ${permalink(id)}
</div>`;
}

function renderAssistantMessage(
  msg: AssistantMessage,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
  createdAt: Date,
): string {
  if (msg.stopReason === "error") {
    return renderErrorMessage(msg, id, createdAt);
  }
  if (msg.stopReason === "toolUse") {
    return renderToolUseMessage(msg, resultMap, id, createdAt);
  }
  return renderAssistantTextMessage(msg, resultMap, id, createdAt);
}

function renderMessage(
  msg: Message,
  username: string,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
  createdAt: Date,
): string {
  switch (msg.role) {
    case "user":
      return renderUserMessage(msg, username, id, createdAt);
    case "assistant":
      return renderAssistantMessage(msg, resultMap, id, createdAt);
    case "toolResult":
      return ""; // rendered inline with tool calls
    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Webhook notification rendering
// ---------------------------------------------------------------------------

function renderWebhookNotification(n: WebhookNotification, id: string): string {
  const source = n.source === "sonarr" ? "Sonarr" : "Radarr";
  const p = n.payload;

  let detail = "";
  if (p.episodes && p.episodes.length > 0) {
    const epList = p.episodes
      .map(
        (e) =>
          `S${String(e.seasonNumber).padStart(2, "0")}E${String(e.episodeNumber).padStart(2, "0")} "${escapeHtml(e.title)}"`,
      )
      .join(", ");
    detail = `\n${epList}`;
  }
  if (p.quality) {
    detail += `\n${escapeHtml(p.quality)}${p.releaseGroup ? ` · ${escapeHtml(p.releaseGroup)}` : ""}`;
  }

  return `<div class="message webhook" id="${id}">
  <div class="webhook-icon">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  </div>
  <div class="message-body">
    <div class="webhook-header">
      <span class="webhook-badge">${escapeHtml(source)}</span>
      <time datetime="${n.receivedAt.toISOString()}">${escapeHtml(formatISOTime(n.receivedAt))}</time>
    </div>
    <div class="webhook-title">${escapeHtml(p.title)}${p.year ? ` (${p.year})` : ""}</div>
    ${detail ? `<div class="webhook-detail">${escapeHtml(detail.trim())}</div>` : ""}
  </div>
  ${permalink(id)}
</div>`;
}

// ---------------------------------------------------------------------------
// Media refs summary (detail page)
// ---------------------------------------------------------------------------

function renderMediaRefsSummary(refs: MediaRefRow[], usernameMap: Map<string, string>): string {
  if (refs.length === 0) return "";

  const items = refs
    .map((ref) => {
      const isAdd = ref.action === "add";
      const symbol = isAdd ? "+" : "−";
      const symbolClass = isAdd ? "media-ref-add" : "media-ref-remove";
      const ids = ref.ids as Record<string, unknown>;

      let titleHtml: string;
      if (ref.mediaType === "movie" && RADARR_HOST && ids.titleSlug) {
        titleHtml = `<a href="${escapeHtml(RADARR_HOST)}/movie/${escapeHtml(ids.titleSlug as string)}" target="_blank" rel="noopener">${escapeHtml(ref.title)}</a>`;
      } else if (ref.mediaType === "series" && SONARR_HOST && ids.titleSlug) {
        titleHtml = `<a href="${escapeHtml(SONARR_HOST)}/series/${escapeHtml(ids.titleSlug as string)}" target="_blank" rel="noopener">${escapeHtml(ref.title)}</a>`;
      } else {
        titleHtml = escapeHtml(ref.title);
      }

      const username = ref.userId ? usernameMap.get(ref.userId) : null;
      const metaParts = [ref.mediaType];
      if (username) metaParts.push(`@${username}`);
      const meta = escapeHtml(metaParts.join(" · "));

      return `<div class="media-ref-item">
    <span class="${symbolClass}">${symbol}</span>
    <span class="media-ref-title">${titleHtml}</span>
    <span class="media-ref-meta">${meta}</span>
  </div>`;
    })
    .join("\n  ");

  return `<div class="media-refs-summary">
  <div class="media-refs-label">Media</div>
  ${items}
</div>`;
}

// ---------------------------------------------------------------------------
// Main page renderer
// ---------------------------------------------------------------------------

export type TimestampedMessage = { msg: Message; createdAt: Date; userId?: string | null };

export function renderThreadPage(
  threadLabel: string,
  createdAt: Date,
  interfaceType: string,
  messages: TimestampedMessage[],
  usernameMap: Map<string, string> = new Map(),
  shareUrl?: string,
  webhookNotifications: WebhookNotification[] = [],
  mediaRefs: MediaRefRow[] = [],
): string {
  // Build a map of toolCallId → ToolResultMessage for pairing
  const resultMap = new Map<string, ToolResultMessage>();
  for (const { msg } of messages) {
    if (msg.role === "toolResult") {
      resultMap.set(msg.toolCallId, msg);
    }
  }

  // Derive page title from first user message
  let pageTitle = "Conversation";
  const firstUser = messages.find((m) => m.msg.role === "user");
  if (firstUser) {
    const msg = firstUser.msg as UserMessage;
    let text: string;
    if (typeof msg.content === "string") {
      text = msg.content;
    } else {
      text =
        msg.content
          .filter((c): c is TextContent => c.type === "text")
          .map((c) => c.text)
          .join(" ") || "";
    }
    // Strip Slack user mentions like <@U099N4BJT5Y>
    text = text.replace(/<@[A-Z0-9]+>/g, "").trim();
    if (text.length > 80) text = text.slice(0, 80) + "…";
    if (text) pageTitle = text;
  }

  const interfaceIcon =
    interfaceType === "discord"
      ? `<span class="interface-icon discord-icon">${DISCORD_ICON}</span>`
      : `<span class="interface-icon slack-icon">${SLACK_ICON}</span>`;

  // Interleave messages and webhook notifications by timestamp
  type RenderItem =
    | { kind: "message"; tsMsg: TimestampedMessage; ts: number }
    | { kind: "webhook"; notification: WebhookNotification; ts: number };

  const allItems: RenderItem[] = [
    ...messages.map(
      (m): RenderItem => ({
        kind: "message",
        tsMsg: m,
        ts: m.createdAt.getTime(),
      }),
    ),
    ...webhookNotifications.map(
      (n): RenderItem => ({
        kind: "webhook",
        notification: n,
        ts: n.receivedAt.getTime(),
      }),
    ),
  ].sort((a, b) => a.ts - b.ts);

  let msgCounter = 0;
  let webhookCounter = 0;
  let lastDateKey = "";

  const messagesHtml = allItems
    .map((item) => {
      const itemDate = new Date(item.ts);
      const dk = dateKey(itemDate);
      let separator = "";
      if (dk !== lastDateKey) {
        lastDateKey = dk;
        separator = dateSeparator(itemDate);
      }

      if (item.kind === "message") {
        const id = `msg-${msgCounter++}`;
        const username = (item.tsMsg.userId && usernameMap.get(item.tsMsg.userId)) ?? "You";
        const html = renderMessage(item.tsMsg.msg, username, resultMap, id, item.tsMsg.createdAt);
        return html ? separator + html : "";
      } else {
        const id = `webhook-${webhookCounter++}`;
        return separator + renderWebhookNotification(item.notification, id);
      }
    })
    .filter(Boolean)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)} — Kyle</title>
<style>
  ${CSS_PALETTE}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.6;
    padding: 2rem 1rem;
  }
  a { color: var(--accent-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .container { max-width: 800px; margin: 0 auto; }

  /* Header */
  header { margin-bottom: 2rem; border-bottom: 1px solid var(--border-subtle); padding-bottom: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  .header-text h1 { font-size: 1.25rem; font-weight: 600; line-height: 1.3; }
  .header-meta { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-secondary); margin-top: 0.25rem; }
  .breadcrumb { font-size: 0.8125rem; color: var(--text-secondary); margin-bottom: 0.25rem; }
  .breadcrumb a { color: var(--accent-blue); }
  .interface-icon { display: inline-flex; align-items: center; color: var(--text-muted); }
  .interface-icon.discord-icon { color: var(--accent-cyan); }
  .interface-icon.slack-icon { color: var(--accent-blue); }
  .share-btn { flex-shrink: 0; display: inline-flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.75rem; background: var(--bg-elevated); border: 1px solid var(--border-muted); border-radius: 6px; color: var(--text-secondary); font-size: 0.8125rem; cursor: pointer; white-space: nowrap; transition: border-color 0.15s, color 0.15s; }
  .share-btn:hover { border-color: var(--text-secondary); color: var(--text-primary); }
  .share-btn svg { flex-shrink: 0; }

  /* Avatar */
  .avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8125rem; font-weight: 700; color: var(--bg-base); flex-shrink: 0; }
  .avatar-kyle { background: var(--accent-purple); border-radius: 8px; border: 1.5px solid color-mix(in srgb, var(--accent-purple) 50%, white); }

  /* Messages */
  .message { display: flex; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: 8px; border-left: 3px solid transparent; position: relative; scroll-margin-top: 1rem; margin-bottom: 0.5rem; }
  .message-body { flex: 1; min-width: 0; }
  .message-header { display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.25rem; }
  .message-header time { font-size: 0.75rem; color: var(--text-muted); margin-left: auto; white-space: nowrap; }
  .username { font-size: 0.8125rem; font-weight: 600; }

  .message.user { background: var(--bg-surface); border-left-color: var(--accent-blue); }
  .message.user .username { color: var(--accent-blue); }

  .message.assistant { background: var(--bg-surface); border-left-color: var(--accent-green); }
  .message.assistant .username { color: var(--accent-green); }

  .message.tool-use { background: var(--bg-surface); border-left: 2px solid var(--accent-purple); opacity: 0.85; cursor: pointer; }
  .message.tool-use .username { color: var(--accent-purple); }
  .tool-use-summary { display: flex; gap: 0.75rem; list-style: none; }
  .tool-use-summary::-webkit-details-marker { display: none; }
  .tool-details-content { margin-left: calc(32px + 0.75rem); padding-top: 0.5rem; border-top: 1px solid var(--border-subtle); margin-top: 0.5rem; }
  .tool-detail-group { margin-bottom: 0.75rem; }
  .tool-detail-group:last-child { margin-bottom: 0; }

  /* Content */
  .content { word-break: break-word; }
  .content p { margin-bottom: 0.5em; }
  .content p:last-child { margin-bottom: 0; }
  .content a { color: var(--accent-blue); }
  .content a:hover { text-decoration: underline; }
  .content ul { margin: 0.5em 0; padding-left: 1.5em; }
  .content li { margin-bottom: 0.25em; }
  .content code { background: var(--bg-elevated); padding: 0.125em 0.375em; border-radius: 4px; font-size: 0.875em; }
  .content pre { background: var(--bg-base); padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.8125rem; margin: 0.5em 0; border: 1px solid var(--border-subtle); }
  .content pre code { background: none; padding: 0; border-radius: 0; font-size: inherit; }
  .content strong { font-weight: 600; }

  /* Tool summaries */
  .tool-thinking { font-style: italic; color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.875rem; }
  .tool-thinking p { margin-bottom: 0.25em; }
  .tool-summary-row { display: flex; align-items: center; gap: 0.5rem; font-size: 0.8125rem; color: var(--text-secondary); padding: 0.125rem 0; }
  .tool-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .tool-status-ok { background: var(--accent-green); }
  .tool-status-error { background: var(--accent-red); }
  .tool-summary-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tool-detail-section { margin-top: 0.375rem; }
  .tool-detail-label { font-size: 0.6875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.125rem; }
  .tool-details-content pre { background: var(--bg-base); padding: 0.5rem; border-radius: 6px; overflow-x: auto; font-size: 0.75rem; margin-top: 0.25rem; border: 1px solid var(--border-subtle); max-height: 300px; overflow-y: auto; }
  .tool-error { color: var(--accent-red); }

  /* Error card */
  .message.error-card { background: color-mix(in srgb, var(--accent-red) 8%, var(--bg-surface)); border-left-color: var(--accent-red); }
  .message.error-card .username { color: var(--accent-red); }
  .error-friendly { color: var(--text-primary); font-size: 0.9375rem; margin-bottom: 0.5rem; }
  .error-raw > summary { cursor: pointer; font-size: 0.75rem; color: var(--text-muted); padding: 0.125rem 0; }
  .error-raw > summary:hover { color: var(--text-secondary); }
  .error-raw pre { background: var(--bg-base); padding: 0.5rem; border-radius: 6px; overflow-x: auto; font-size: 0.75rem; margin-top: 0.25rem; border: 1px solid var(--border-subtle); color: var(--accent-red); }

  /* Webhook notifications */
  .message.webhook { background: color-mix(in srgb, var(--accent-amber) 6%, var(--bg-surface)); border-left-color: var(--accent-amber); }
  .webhook-icon { width: 32px; height: 32px; border-radius: 50%; background: color-mix(in srgb, var(--accent-amber) 20%, var(--bg-elevated)); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--accent-amber); }
  .webhook-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
  .webhook-badge { font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: color-mix(in srgb, var(--accent-amber) 15%, var(--bg-elevated)); color: var(--accent-amber); border: 1px solid color-mix(in srgb, var(--accent-amber) 25%, transparent); border-radius: 4px; padding: 0.1rem 0.4rem; }
  .webhook-header time { font-size: 0.75rem; color: var(--text-muted); margin-left: auto; }
  .webhook-title { font-weight: 600; color: var(--text-primary); font-size: 0.9375rem; }
  .webhook-detail { margin-top: 0.25rem; font-size: 0.8125rem; color: var(--text-secondary); white-space: pre-wrap; }

  /* Date separator */
  .date-separator { display: flex; align-items: center; gap: 1rem; margin: 1.25rem 0; }
  .date-separator::before, .date-separator::after { content: ''; flex: 1; height: 1px; background: var(--border-subtle); }
  .date-separator span { font-size: 0.75rem; color: var(--text-muted); white-space: nowrap; }

  /* Permalink */
  .permalink { position: absolute; top: 0.75rem; right: 0.75rem; opacity: 0; color: var(--text-muted); text-decoration: none; font-size: 0.875rem; line-height: 1; transition: opacity 0.15s; user-select: none; }
  .message:hover .permalink { opacity: 1; }
  .permalink:hover { color: var(--text-primary); text-decoration: none; }

  /* Permalink target highlight */
  @keyframes highlight-flash {
    0% { background: color-mix(in srgb, var(--accent-blue) 15%, transparent); }
    100% { background: transparent; }
  }
  .message:target { animation: highlight-flash 2s ease-out; }

  /* Media refs summary */
  .media-refs-summary { background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.5rem; }
  .media-refs-label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: 0.5rem; }
  .media-ref-item { display: flex; align-items: baseline; gap: 0.5rem; padding: 0.125rem 0; font-size: 0.875rem; }
  .media-ref-add { color: var(--accent-green); font-weight: 700; flex-shrink: 0; }
  .media-ref-remove { color: var(--accent-red); font-weight: 700; flex-shrink: 0; }
  .media-ref-title a { color: var(--accent-blue); }
  .media-ref-meta { color: var(--text-muted); font-size: 0.8125rem; margin-left: auto; white-space: nowrap; }

  /* Mobile: 480-768 */
  @media (max-width: 768px) {
    body { padding: 1rem 0.75rem; }
    .message { padding: 0.75rem; }
    .message-header { flex-wrap: wrap; }
    .message-header time { margin-left: 0; font-size: 0.6875rem; }
    header { flex-direction: column; gap: 0.75rem; }
    .share-btn { align-self: flex-start; }
  }

  /* Mobile: < 480 */
  @media (max-width: 480px) {
    body { padding: 0.75rem 0.5rem; }
    .container { max-width: 100%; }
    .message { padding: 0.625rem 0.5rem; gap: 0.5rem; }
    .avatar { width: 28px; height: 28px; font-size: 0.75rem; }
    .avatar-kyle { border-radius: 6px; }
    .tool-details-content pre, .error-raw pre, .content pre { max-height: 300px; overflow-y: auto; }
    .media-ref-item { flex-wrap: wrap; }
    .media-ref-meta { margin-left: 0; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-text">
      ${shareUrl ? `<div class="breadcrumb"><a href="/threads/">← All threads</a></div>` : ""}
      <h1>${escapeHtml(pageTitle)}</h1>
      <div class="header-meta">
        ${interfaceIcon}
        <time datetime="${createdAt.toISOString()}">${escapeHtml(formatISOTime(createdAt))}</time>
      </div>
    </div>
    ${shareUrl ? `<button class="share-btn" onclick="copyShareUrl()" id="share-btn">${SHARE_ICON} Share</button>` : ""}
  </header>
  ${renderMediaRefsSummary(mediaRefs, usernameMap)}
  ${messagesHtml}
</div>
<script>
  function copyPermalink(id) {
    var url = location.href.split('#')[0] + '#' + id;
    navigator.clipboard.writeText(url).catch(function(){});
    var el = document.getElementById(id);
    if (el) { var p = el.querySelector('.permalink'); if (p) { p.textContent = '✓'; setTimeout(function() { p.textContent = '#'; }, 1500); } }
  }
  ${
    shareUrl
      ? `
  var SHARE_URL = ${JSON.stringify(shareUrl)};
  function copyShareUrl() {
    navigator.clipboard.writeText(SHARE_URL).catch(function(){});
    var btn = document.getElementById('share-btn');
    if (btn) { btn.innerHTML = 'Copied!'; setTimeout(function() { btn.innerHTML = ${JSON.stringify(`${SHARE_ICON} Share`)}; }, 2000); }
  }`
      : ""
  }
  ${RELATIVE_TIME_JS}
</script>
</body>
</html>`;
}
