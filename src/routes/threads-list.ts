import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { checkAuth, signThreadSig } from "./threads-auth.ts";
import { createLogger } from "../logger.ts";

const log = createLogger("threads-list");

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractThreadTs(externalId: string): string {
  const colon = externalId.lastIndexOf(":");
  return colon >= 0 ? externalId.slice(colon + 1) : externalId;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export async function handleThreadList(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const authResponse = await checkAuth(req, url);
  if (authResponse) return authResponse;

  // Get all Slack conversations with message count and first user message preview
  const rows = await db
    .select({
      id: conversations.id,
      externalId: conversations.externalId,
      userId: conversations.userId,
      createdAt: conversations.createdAt,
      messageCount: sql<number>`(
        SELECT COUNT(*) FROM ${messages}
        WHERE ${messages.conversationId} = ${conversations.id}
      )`.as("message_count"),
      preview: sql<string | null>`(
        SELECT CASE
          WHEN jsonb_typeof(data->'content') = 'string' THEN data->>'content'
          WHEN jsonb_typeof(data->'content') = 'array'  THEN (
            SELECT elem->>'text'
            FROM jsonb_array_elements(data->'content') AS elem
            WHERE elem->>'type' = 'text'
            LIMIT 1
          )
        END
        FROM ${messages}
        WHERE ${messages.conversationId} = ${conversations.id}
          AND role = 'user'
        ORDER BY sequence ASC
        LIMIT 1
      )`.as("preview"),
    })
    .from(conversations)
    .where(eq(conversations.interfaceType, "slack"))
    .orderBy(desc(conversations.createdAt))
    .limit(200);

  log.info("listing threads", { count: rows.length });

  // Pre-sign all thread URLs
  const threadRows = await Promise.all(
    rows.map(async (row) => {
      const threadTs = extractThreadTs(row.externalId ?? "");
      const sig = await signThreadSig(threadTs).catch(() => null);
      const shareUrl = sig ? `${url.origin}/threads/${threadTs}?sig=${sig}` : null;
      return { ...row, threadTs, shareUrl };
    }),
  );

  const rowsHtml = threadRows
    .map(
      (row) => `
    <tr>
      <td class="ts-cell">
        <a href="/threads/${escapeHtml(row.threadTs)}">${escapeHtml(row.threadTs)}</a>
      </td>
      <td class="date-cell">${escapeHtml(formatDate(row.createdAt))}</td>
      <td class="preview-cell">${row.preview ? escapeHtml(truncate(row.preview, 120)) : '<span class="empty">—</span>'}</td>
      <td class="count-cell">${row.messageCount}</td>
      <td class="share-cell">${row.shareUrl ? `<button class="share-btn" onclick="copyUrl(this, ${JSON.stringify(row.shareUrl)})">Copy</button>` : ""}</td>
    </tr>`,
    )
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Threads — Kyle</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: #0d1117;
    color: #c9d1d9;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.5;
    padding: 2rem 1rem;
  }
  .container { max-width: 1000px; margin: 0 auto; }
  header { margin-bottom: 1.5rem; border-bottom: 1px solid #21262d; padding-bottom: 1rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  header .meta { font-size: 0.875rem; color: #8b949e; margin-top: 0.25rem; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8b949e;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #21262d;
  }
  td { padding: 0.625rem 0.75rem; border-bottom: 1px solid #161b22; vertical-align: middle; }
  tr:hover td { background: #161b22; }
  a { color: #58a6ff; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .ts-cell { font-family: monospace; font-size: 0.8125rem; white-space: nowrap; }
  .date-cell { white-space: nowrap; font-size: 0.8125rem; color: #8b949e; }
  .preview-cell { color: #c9d1d9; max-width: 400px; }
  .count-cell { text-align: right; font-size: 0.8125rem; color: #8b949e; white-space: nowrap; }
  .share-cell { white-space: nowrap; }
  .empty { color: #484f58; }
  .share-btn {
    padding: 0.25rem 0.625rem;
    background: transparent;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #8b949e;
    font-size: 0.75rem;
    cursor: pointer;
    transition: border-color 0.1s, color 0.1s;
  }
  .share-btn:hover { border-color: #8b949e; color: #c9d1d9; }
</style>
</head>
<body>
<div class="container">
  <header>
    <h1>Threads</h1>
    <div class="meta">${rows.length} conversation${rows.length !== 1 ? "s" : ""}</div>
  </header>
  <table>
    <thead>
      <tr>
        <th>Thread</th>
        <th>Date</th>
        <th>Preview</th>
        <th style="text-align:right">Messages</th>
        <th>Share</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
</div>
<script>
  function copyUrl(btn, url) {
    navigator.clipboard.writeText(url).catch(() => {});
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 2000);
  }
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
