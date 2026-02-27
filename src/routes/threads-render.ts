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

function renderToolCallInner(
  tc: ToolCall,
  result: ToolResultMessage | undefined
): string {
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

function renderToolCallWithResult(
  tc: ToolCall,
  result: ToolResultMessage | undefined
): string {
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
  resultMap: Map<string, ToolResultMessage>
): string {
  // Show error state for failed responses
  if (msg.stopReason === "error") {
    const errorText = msg.errorMessage
      ? prettyPrint(msg.errorMessage)
      : "Error processing message";
    return `<div class="message assistant error">
  <div class="label">Kyle</div>
  <pre class="error-text">${escapeHtml(errorText)}</pre>
</div>`;
  }

  // Internal tool-use steps: text visible, tool details collapsible
  if (msg.stopReason === "toolUse") {
    const toolCalls = msg.content.filter((b): b is ToolCall => b.type === "toolCall");
    const hasErrors = toolCalls.some((tc) => resultMap.get(tc.id)?.isError);
    const toolNames = toolCalls.map((b) => b.name);
    const summary = toolNames.length > 0
      ? toolNames.map(escapeHtml).join(", ")
      : "tool call";
    const label = toolCalls.length === 1 ? "Tool Call" : "Tool Calls";

    const textParts: string[] = [];
    const toolParts: string[] = [];
    for (const block of msg.content) {
      if (block.type === "text") {
        textParts.push(`<div class="content">${escapeHtml(block.text)}</div>`);
      } else if (block.type === "toolCall") {
        toolParts.push(renderToolCallInner(block, resultMap.get(block.id)));
      }
    }
    const wrapperClass = hasErrors ? "message tool-use has-errors" : "message tool-use";
    return `<div class="${wrapperClass}">
  ${textParts.join("\n  ")}
  <details${hasErrors ? " open" : ""}>
    <summary><span class="label">${label}</span> ${summary}${hasErrors ? ' <span class="tool-error-badge">error</span>' : ""}</summary>
    ${toolParts.join("\n    ")}
  </details>
</div>`;
  }

  const parts: string[] = [];
  for (const block of msg.content) {
    if (block.type === "text") {
      parts.push(`<div class="content">${escapeHtml(block.text)}</div>`);
    } else if (block.type === "toolCall") {
      parts.push(renderToolCallWithResult(block, resultMap.get(block.id)));
    }
    // skip ThinkingContent
  }
  return `<div class="message assistant">
  <div class="label">Kyle</div>
  ${parts.join("\n  ")}
</div>`;
}

function renderMessage(
  msg: Message,
  username: string,
  resultMap: Map<string, ToolResultMessage>
): string {
  switch (msg.role) {
    case "user":
      return renderUserMessage(msg, username);
    case "assistant":
      return renderAssistantMessage(msg, resultMap);
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

export function renderThreadPage(
  threadTs: string,
  createdAt: Date,
  messages: Message[],
  username: string = "You"
): string {
  // Build a map of toolCallId → ToolResultMessage for pairing
  const resultMap = new Map<string, ToolResultMessage>();
  for (const msg of messages) {
    if (msg.role === "toolResult") {
      resultMap.set(msg.toolCallId, msg);
    }
  }

  const messagesHtml = messages
    .map((m) => renderMessage(m, username, resultMap))
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
  header { margin-bottom: 2rem; border-bottom: 1px solid #21262d; padding-bottom: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header .meta { font-size: 0.875rem; color: #8b949e; margin-top: 0.25rem; }
  .message { margin-bottom: 1.25rem; padding: 1rem; border-radius: 8px; border: 1px solid #21262d; }
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
