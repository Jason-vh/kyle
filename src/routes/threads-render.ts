import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ToolCall,
} from "@mariozechner/pi-ai";
import type { WebhookNotification } from "../db/webhook-notifications.ts";

type Message = UserMessage | AssistantMessage | ToolResultMessage;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatSlackLinks(escaped: string): string {
  // Convert Slack mrkdwn links (already HTML-escaped) to <a> tags
  // <url|text> becomes &lt;url|text&gt; after escapeHtml
  return escaped.replace(/&lt;(https?:\/\/[^|]+)\|(.+?)&gt;/g, (_, url, label) => {
    const href = url.replace(/&amp;/g, "&");
    return `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;
  });
}

function prettyPrint(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function permalink(id: string): string {
  return `<a href="#${id}" class="permalink" onclick="copyPermalink('${id}')" title="Copy link">#</a>`;
}

function renderUserMessage(msg: UserMessage, username: string, id: string): string {
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
  <div class="label">${escapeHtml(username)}</div>
  ${permalink(id)}
  <div class="content">${escapeHtml(text)}</div>
</div>`;
}

function renderToolCallInner(tc: ToolCall, result: ToolResultMessage | undefined): string {
  const args = JSON.stringify(tc.arguments, null, 2);
  const isError = result?.isError ?? false;
  let resultHtml = "";
  if (result) {
    const text = result.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const formatted = prettyPrint(text);
    const errorClass = isError ? " tool-error" : "";
    resultHtml = `\n  <div class="tool-section">
    <div class="tool-section-label">Output${isError ? " (error)" : ""}</div>
    <pre class="${errorClass}">${escapeHtml(formatted)}</pre>
  </div>`;
  }
  const nameClass = isError ? "tool-call-name tool-call-name-error" : "tool-call-name";
  return `<div class="tool-call-inner${isError ? " tool-call-inner-error" : ""}">
  <div class="${nameClass}">${escapeHtml(tc.name)}</div>
  <div class="tool-section">
    <div class="tool-section-label">Input</div>
    <pre>${escapeHtml(args)}</pre>
  </div>${resultHtml}
</div>`;
}

function renderToolCallWithResult(tc: ToolCall, result: ToolResultMessage | undefined): string {
  const args = JSON.stringify(tc.arguments, null, 2);
  const isError = result?.isError ?? false;
  let resultHtml = "";
  if (result) {
    const text = result.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
    const formatted = prettyPrint(text);
    const errorClass = isError ? " tool-error" : "";
    resultHtml = `\n  <div class="tool-section">
    <div class="tool-section-label">Output${isError ? " (error)" : ""}</div>
    <pre class="${errorClass}">${escapeHtml(formatted)}</pre>
  </div>`;
  }
  const detailsClass = isError ? "tool-call tool-call-error" : "tool-call";
  const openAttr = isError ? " open" : "";
  return `<details class="${detailsClass}"${openAttr}>
  <summary>${escapeHtml(tc.name)}${isError ? ' <span class="tool-error-badge">error</span>' : ""}</summary>
  <div class="tool-section">
    <div class="tool-section-label">Input</div>
    <pre>${escapeHtml(args)}</pre>
  </div>${resultHtml}
</details>`;
}

function renderAssistantMessage(
  msg: AssistantMessage,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
): string {
  // Show error state for failed responses
  if (msg.stopReason === "error") {
    const errorText = msg.errorMessage ? prettyPrint(msg.errorMessage) : "Error processing message";
    return `<div class="message assistant error" id="${id}">
  <div class="label">Kyle</div>
  ${permalink(id)}
  <pre class="error-text">${escapeHtml(errorText)}</pre>
</div>`;
  }

  // Internal tool-use steps: text visible, tool details collapsible
  if (msg.stopReason === "toolUse") {
    const toolCalls = msg.content.filter((b): b is ToolCall => b.type === "toolCall");
    const hasErrors = toolCalls.some((tc) => resultMap.get(tc.id)?.isError);
    const toolNames = toolCalls.map((b) => b.name);
    const summary = toolNames.length > 0 ? toolNames.map(escapeHtml).join(", ") : "tool call";
    const label = toolCalls.length === 1 ? "Tool Call" : "Tool Calls";

    const textParts: string[] = [];
    const toolParts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text") {
        textParts.push(`<div class="content">${formatSlackLinks(escapeHtml(block.text))}</div>`);
      } else if (block.type === "toolCall") {
        toolParts.push(renderToolCallInner(block, resultMap.get(block.id)));
      }
    }
    const wrapperClass = hasErrors ? "message tool-use has-errors" : "message tool-use";
    return `<div class="${wrapperClass}" id="${id}">
  ${textParts.join("\n  ")}
  ${permalink(id)}
  <details${hasErrors ? " open" : ""}>
    <summary><span class="label">${label}</span> ${summary}${hasErrors ? ' <span class="tool-error-badge">error</span>' : ""}</summary>
    ${toolParts.join("\n    ")}
  </details>
</div>`;
  }

  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      parts.push(`<div class="content">${formatSlackLinks(escapeHtml(block.text))}</div>`);
    } else if (block.type === "toolCall") {
      parts.push(renderToolCallWithResult(block, resultMap.get(block.id)));
    }
    // skip ThinkingContent
  }
  return `<div class="message assistant" id="${id}">
  <div class="label">Kyle</div>
  ${permalink(id)}
  ${parts.join("\n  ")}
</div>`;
}

function renderMessage(
  msg: Message,
  username: string,
  resultMap: Map<string, ToolResultMessage>,
  id: string,
): string {
  switch (msg.role) {
    case "user":
      return renderUserMessage(msg, username, id);
    case "assistant":
      return renderAssistantMessage(msg, resultMap, id);
    case "toolResult":
      return ""; // rendered inline with tool calls
    default:
      return "";
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatWebhookDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  <div class="webhook-header">
    <span class="webhook-badge">${escapeHtml(source)} webhook</span>
    <span class="webhook-time">${escapeHtml(formatWebhookDate(n.receivedAt))}</span>
  </div>
  ${permalink(id)}
  <div class="webhook-title">${escapeHtml(p.title)}${p.year ? ` (${p.year})` : ""}</div>
  ${detail ? `<div class="webhook-detail">${escapeHtml(detail.trim())}</div>` : ""}
</div>`;
}

export function renderThreadPage(
  threadTs: string,
  createdAt: Date,
  messages: Message[],
  username: string = "You",
  shareUrl?: string,
  webhookNotifications: WebhookNotification[] = [],
): string {
  // Build a map of toolCallId → ToolResultMessage for pairing
  const resultMap = new Map<string, ToolResultMessage>();
  for (const msg of messages) {
    if (msg.role === "toolResult") {
      resultMap.set(msg.toolCallId, msg);
    }
  }

  // Interleave messages and webhook notifications by timestamp
  type RenderItem =
    | { kind: "message"; msg: Message; ts: number; idx: number }
    | { kind: "webhook"; notification: WebhookNotification; ts: number; idx: number };

  const msgItems: RenderItem[] = messages.map((msg, idx) => ({
    kind: "message",
    msg,
    ts: (msg as any).timestamp ?? createdAt.getTime() + idx,
    idx,
  }));
  const webhookItems: RenderItem[] = webhookNotifications.map((n, idx) => ({
    kind: "webhook",
    notification: n,
    ts: n.receivedAt.getTime(),
    idx,
  }));

  const allItems = [...msgItems, ...webhookItems].sort((a, b) => a.ts - b.ts);

  let msgCounter = 0;
  let webhookCounter = 0;
  const messagesHtml = allItems
    .map((item) => {
      if (item.kind === "message") {
        const id = `msg-${msgCounter++}`;
        return renderMessage(item.msg, username, resultMap, id);
      } else {
        const id = `webhook-${webhookCounter++}`;
        return renderWebhookNotification(item.notification, id);
      }
    })
    .filter(Boolean)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Thread ${escapeHtml(threadTs)} — Kyle</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    line-height: 1.5;
    padding: 2rem 1rem;
  }
  .container { max-width: 800px; margin: 0 auto; }
  header { margin-bottom: 2rem; border-bottom: 1px solid #21262d; padding-bottom: 1rem; display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
  header .header-text h1 { font-size: 1.25rem; font-weight: 600; }
  header .header-text .meta { font-size: 0.875rem; color: #8b949e; margin-top: 0.25rem; }
  header .header-text .breadcrumb { font-size: 0.8125rem; color: #8b949e; margin-bottom: 0.25rem; }
  header .header-text .breadcrumb a { color: #58a6ff; text-decoration: none; }
  header .header-text .breadcrumb a:hover { text-decoration: underline; }
  .share-btn { flex-shrink: 0; padding: 0.375rem 0.75rem; background: #161b22; border: 1px solid #30363d; border-radius: 6px; color: #8b949e; font-size: 0.8125rem; cursor: pointer; white-space: nowrap; transition: border-color 0.1s, color 0.1s; }
  .share-btn:hover { border-color: #8b949e; color: #c9d1d9; }
  .message { margin-bottom: 1.25rem; padding: 1rem; border-radius: 8px; border: 1px solid #21262d; position: relative; scroll-margin-top: 1rem; }
  .message.user { background: #161b22; border-left: 3px solid #58a6ff; }
  .message.assistant { background: #161b22; border-left: 3px solid #3fb950; }
  .message.tool-use { background: #13171e; border-left: 3px solid #d2a8ff; }
  .message.tool-use summary { color: #c9d1d9; font-size: 0.875rem; }
  .message.tool-use summary .label { display: inline; margin-bottom: 0; color: #d2a8ff; }
  .message.tool-use > .content { font-style: italic; color: #8b949e; }
  .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; color: #8b949e; }
  .message.user .label { color: #58a6ff; }
  .message.assistant .label { color: #3fb950; }
  .content { white-space: pre-wrap; word-break: break-word; }
  .content a { color: #58a6ff; text-decoration: none; }
  .content a:hover { text-decoration: underline; }
  details { margin-top: 0.5rem; }
  summary { cursor: pointer; font-size: 0.875rem; color: #8b949e; padding: 0.25rem 0; }
  summary:hover { color: #c9d1d9; }
  pre { background: #0d1117; padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.8125rem; margin-top: 0.5rem; border: 1px solid #21262d; }
  .tool-call summary { color: #d2a8ff; }
  .tool-call-inner { margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid #21262d; }
  .tool-call-inner:first-child { margin-top: 0.5rem; border-top: none; padding-top: 0; }
  .tool-call-name { font-size: 0.875rem; font-weight: 600; color: #d2a8ff; margin-bottom: 0.25rem; }
  .tool-section { margin-top: 0.5rem; }
  .tool-section-label { font-size: 0.75rem; font-weight: 600; color: #8b949e; text-transform: uppercase; letter-spacing: 0.05em; }
  .tool-error { color: #f85149; }
  .message.assistant.error { border-left-color: #f85149; }
  .error-text { color: #f85149; }
  .message.tool-use.has-errors { border-left-color: #f85149; }
  .tool-call.tool-call-error > summary { color: #f85149; }
  .tool-call-name-error { color: #f85149; }
  .tool-call-inner-error { border-top-color: #30191a; }
  .tool-error-badge { display: inline-block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; background: #30191a; color: #f85149; border: 1px solid #f8514940; border-radius: 4px; padding: 0 4px; vertical-align: middle; margin-left: 6px; }
  .permalink { position: absolute; top: 0.75rem; right: 0.75rem; opacity: 0; color: #8b949e; text-decoration: none; font-size: 0.875rem; line-height: 1; transition: opacity 0.1s; user-select: none; }
  .message:hover .permalink { opacity: 1; }
  .permalink:hover { color: #c9d1d9; }
  .message.webhook { background: #111b2b; border-left: 3px solid #388bfd; }
  .webhook-header { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.375rem; }
  .webhook-badge { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; background: #1c2d4a; color: #388bfd; border: 1px solid #1f408080; border-radius: 4px; padding: 0.1rem 0.4rem; }
  .webhook-time { font-size: 0.8125rem; color: #8b949e; }
  .webhook-title { font-weight: 600; color: #c9d1d9; }
  .webhook-detail { margin-top: 0.25rem; font-size: 0.8125rem; color: #8b949e; white-space: pre-wrap; }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-text">
      ${shareUrl ? `<div class="breadcrumb"><a href="/threads/">← All threads</a></div>` : ""}
      <h1>Thread ${escapeHtml(threadTs)}</h1>
      <div class="meta">${escapeHtml(formatDate(createdAt))}</div>
    </div>
    ${shareUrl ? `<button class="share-btn" onclick="copyShareUrl()" id="share-btn">Copy share link</button>` : ""}
  </header>
  ${messagesHtml}
</div>
<script>
  function copyPermalink(id) {
    const url = location.href.split('#')[0] + '#' + id;
    navigator.clipboard.writeText(url).catch(() => {});
    const el = document.getElementById(id)?.querySelector('.permalink');
    if (el) { el.textContent = '✓'; setTimeout(() => { el.textContent = '#'; }, 1500); }
  }
  ${
    shareUrl
      ? `
  const SHARE_URL = ${JSON.stringify(shareUrl)};
  function copyShareUrl() {
    navigator.clipboard.writeText(SHARE_URL).catch(() => {});
    const btn = document.getElementById('share-btn');
    if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy share link'; }, 2000); }
  }`
      : ""
  }
</script>
</body>
</html>`;
}
