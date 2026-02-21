import type {
  UserMessage,
  AssistantMessage,
  ToolResultMessage,
  TextContent,
  ThinkingContent,
  ToolCall,
} from "@mariozechner/pi-ai";

type Message = UserMessage | AssistantMessage | ToolResultMessage;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function prettyPrint(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

function renderUserMessage(msg: UserMessage, username: string): string {
  let text: string;
  if (typeof msg.content === "string") {
    text = msg.content;
  } else {
    text = msg.content
      .filter((c): c is TextContent => c.type === "text")
      .map((c) => c.text)
      .join("\n");
  }
  return `<div class="message user">
  <div class="label">${escapeHtml(username)}</div>
  <div class="content">${escapeHtml(text)}</div>
</div>`;
}

function renderToolCall(tc: ToolCall): string {
  const args = JSON.stringify(tc.arguments, null, 2);
  return `<details class="tool-call">
  <summary>${escapeHtml(tc.name)}</summary>
  <pre>${escapeHtml(args)}</pre>
</details>`;
}

function renderAssistantMessage(msg: AssistantMessage): string {
  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      parts.push(`<div class="content">${escapeHtml(block.text)}</div>`);
    } else if (block.type === "toolCall") {
      parts.push(renderToolCall(block));
    }
    // skip ThinkingContent
  }
  return `<div class="message assistant">
  <div class="label">Kyle</div>
  ${parts.join("\n  ")}
</div>`;
}

function renderToolResult(msg: ToolResultMessage): string {
  const text = msg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("\n");
  const formatted = prettyPrint(text);
  return `<div class="message tool-result">
  <details>
    <summary>${escapeHtml(msg.toolName)}${msg.isError ? " (error)" : ""}</summary>
    <pre>${escapeHtml(formatted)}</pre>
  </details>
</div>`;
}

function renderMessage(msg: Message, username: string): string {
  switch (msg.role) {
    case "user":
      return renderUserMessage(msg, username);
    case "assistant":
      return renderAssistantMessage(msg);
    case "toolResult":
      return renderToolResult(msg);
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

export function renderThreadPage(
  threadTs: string,
  createdAt: Date,
  messages: Message[],
  username: string = "You"
): string {
  const messagesHtml = messages.map((m) => renderMessage(m, username)).join("\n");

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
  header { margin-bottom: 2rem; border-bottom: 1px solid #21262d; padding-bottom: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header .meta { font-size: 0.875rem; color: #8b949e; margin-top: 0.25rem; }
  .message { margin-bottom: 1.25rem; padding: 1rem; border-radius: 8px; border: 1px solid #21262d; }
  .message.user { background: #161b22; border-left: 3px solid #58a6ff; }
  .message.assistant { background: #161b22; border-left: 3px solid #3fb950; }
  .message.tool-result { background: #13171e; border-left: 3px solid #8b949e; }
  .label { font-size: 0.75rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; color: #8b949e; }
  .message.user .label { color: #58a6ff; }
  .message.assistant .label { color: #3fb950; }
  .content { white-space: pre-wrap; word-break: break-word; }
  details { margin-top: 0.5rem; }
  summary { cursor: pointer; font-size: 0.875rem; color: #8b949e; padding: 0.25rem 0; }
  summary:hover { color: #c9d1d9; }
  pre { background: #0d1117; padding: 0.75rem; border-radius: 6px; overflow-x: auto; font-size: 0.8125rem; margin-top: 0.5rem; border: 1px solid #21262d; }
  .tool-call summary { color: #d2a8ff; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Thread ${escapeHtml(threadTs)}</h1>
    <div class="meta">${escapeHtml(formatDate(createdAt))}</div>
  </header>
  ${messagesHtml}
</div>
</body>
</html>`;
}
