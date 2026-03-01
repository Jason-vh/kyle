import { desc, sql, count, ne, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { conversations, messages } from "../db/schema.ts";
import { checkAuth, signThreadSig } from "./threads-auth.ts";
import { createLogger } from "../logger.ts";
import {
  escapeHtml,
  CSS_PALETTE,
  RELATIVE_TIME_JS,
  SLACK_ICON,
  DISCORD_ICON,
  SHARE_ICON,
} from "./threads-utils.ts";

const log = createLogger("threads-list");

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

type MediaRefPill = { action: string; title: string };

export async function handleThreadList(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const authResponse = await checkAuth(req, url);
  if (authResponse) return authResponse;

  // Subquery: message counts per conversation (excluding toolResult)
  const msgCounts = db
    .select({
      conversationId: messages.conversationId,
      msgCount: count().as("msg_count"),
    })
    .from(messages)
    .where(ne(messages.role, "toolResult"))
    .groupBy(messages.conversationId)
    .as("msg_counts");

  // Get all Slack + Discord conversations with message count, preview, and media refs
  const rows = await db
    .select({
      id: conversations.id,
      externalId: conversations.externalId,
      interfaceType: conversations.interfaceType,
      metadata: conversations.metadata,
      createdAt: conversations.createdAt,
      messageCount: msgCounts.msgCount,
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
      mediaRefsJson: sql<string | null>`(
        SELECT json_agg(
          json_build_object('action', action, 'title', title)
          ORDER BY created_at ASC
        )::text
        FROM (
          SELECT action, title, created_at
          FROM media_refs
          WHERE conversation_id = ${conversations.id}
          LIMIT 5
        ) sub
      )`.as("media_refs_json"),
    })
    .from(conversations)
    .leftJoin(msgCounts, sql`${conversations.id} = ${msgCounts.conversationId}`)
    .where(inArray(conversations.interfaceType, ["slack", "discord"]))
    .orderBy(desc(conversations.createdAt))
    .limit(200);

  log.info("listing threads", { count: rows.length });

  // Pre-sign all thread URLs
  const threadRows = await Promise.all(
    rows.map(async (row) => {
      const sig = await signThreadSig(row.id).catch(() => null);
      const shareUrl = sig ? `${url.origin}/threads/${row.id}?sig=${sig}` : null;
      let mediaRefs: MediaRefPill[] = [];
      if (row.mediaRefsJson) {
        try {
          mediaRefs = JSON.parse(row.mediaRefsJson) as MediaRefPill[];
        } catch {
          // ignore
        }
      }
      // Clean preview: strip Slack mentions
      let preview = row.preview || "";
      preview = preview.replace(/<@[A-Z0-9]+>/g, "").trim();
      return { ...row, preview, shareUrl, mediaRefs };
    }),
  );

  const cardsHtml = threadRows
    .map((row) => {
      const previewText = row.preview ? truncate(row.preview, 80) : "Untitled conversation";
      const isDiscord = row.interfaceType === "discord";
      const icon = isDiscord
        ? `<span class="card-icon discord-icon">${DISCORD_ICON}</span>`
        : `<span class="card-icon slack-icon">${SLACK_ICON}</span>`;

      const pillsHtml = row.mediaRefs
        .map((ref) => {
          const isAdd = ref.action === "add";
          const cls = isAdd ? "pill-add" : "pill-remove";
          const symbol = isAdd ? "+" : "−";
          return `<span class="pill ${cls}">${symbol} ${escapeHtml(truncate(ref.title, 30))}</span>`;
        })
        .join("");

      const shareBtn = row.shareUrl
        ? `<button class="card-share" data-url="${escapeHtml(row.shareUrl)}" title="Copy share link">${SHARE_ICON}</button>`
        : "";

      return `<a href="/threads/${escapeHtml(row.id)}" class="card">
  <div class="card-main">
    <div class="card-title">
      ${icon}
      <span class="card-preview">${escapeHtml(previewText)}</span>
    </div>
    <div class="card-meta">
      <time datetime="${row.createdAt.toISOString()}">${escapeHtml(row.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }))}</time>
      <span class="card-count">${row.messageCount ?? 0} messages</span>
    </div>
  </div>
  ${pillsHtml ? `<div class="card-pills">${pillsHtml}</div>` : ""}
  ${shareBtn}
</a>`;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Threads — Kyle</title>
<style>
  ${CSS_PALETTE}
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg-base);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 0.9375rem;
    line-height: 1.5;
    padding: 2rem 1rem;
  }
  a { color: var(--accent-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }
  .container { max-width: 700px; margin: 0 auto; }

  /* Header */
  header { margin-bottom: 1.5rem; }
  header h1 { font-size: 1.25rem; font-weight: 600; }
  .header-row { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 0.75rem; }
  .header-meta { font-size: 0.8125rem; color: var(--text-secondary); }

  /* Search */
  .search-wrap { margin-bottom: 1.25rem; }
  .search-input {
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .search-input::placeholder { color: var(--text-muted); }
  .search-input:focus { border-color: var(--accent-blue); }

  /* Cards */
  .card-list { display: flex; flex-direction: column; gap: 6px; }
  .card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.875rem 1.125rem;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: 8px;
    text-decoration: none;
    color: inherit;
    transition: background 0.1s, border-color 0.1s;
    position: relative;
    min-height: 44px;
  }
  .card:hover { background: var(--bg-elevated); border-color: var(--border-muted); text-decoration: none; }
  .card-main { flex: 1; min-width: 0; }
  .card-title { display: flex; align-items: center; gap: 0.5rem; }
  .card-icon { display: inline-flex; align-items: center; flex-shrink: 0; color: var(--text-muted); }
  .card-icon.discord-icon { color: var(--accent-cyan); }
  .card-icon.slack-icon { color: var(--accent-blue); }
  .card-preview { font-size: 0.9375rem; font-weight: 500; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-meta { display: flex; align-items: center; gap: 0.75rem; margin-top: 0.125rem; }
  .card-meta time { font-size: 0.75rem; color: var(--text-muted); }
  .card-count { font-size: 0.75rem; color: var(--text-muted); }

  /* Media ref pills */
  .card-pills { display: flex; flex-wrap: wrap; gap: 0.25rem; flex-shrink: 0; max-width: 260px; }
  .pill { display: inline-block; font-size: 0.6875rem; font-weight: 600; padding: 0.0625rem 0.375rem; border-radius: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; }
  .pill-add { background: color-mix(in srgb, var(--accent-green) 15%, var(--bg-elevated)); color: var(--accent-green); }
  .pill-remove { background: color-mix(in srgb, var(--accent-red) 15%, var(--bg-elevated)); color: var(--accent-red); }

  /* Share button on card */
  .card-share {
    display: none;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: transparent;
    border: 1px solid var(--border-muted);
    border-radius: 6px;
    color: var(--text-muted);
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.1s, border-color 0.1s;
  }
  .card:hover .card-share { display: inline-flex; }
  .card-share:hover { color: var(--text-primary); border-color: var(--text-secondary); }

  /* No results */
  .no-results { text-align: center; color: var(--text-muted); padding: 3rem 1rem; display: none; }

  /* Mobile < 768 */
  @media (max-width: 768px) {
    body { padding: 1rem 0.75rem; }
    .card-pills { display: none; }
    .card-share { display: inline-flex; width: 28px; height: 28px; }
  }

  /* Mobile < 480 */
  @media (max-width: 480px) {
    body { padding: 0.75rem 0.5rem; }
    .card { padding: 0.625rem 0.75rem; gap: 0.5rem; }
    .card-preview { font-size: 0.875rem; }
  }
</style>
</head>
<body>
<div class="container">
  <header>
    <div class="header-row">
      <h1>Threads</h1>
      <span class="header-meta">${rows.length} conversation${rows.length !== 1 ? "s" : ""}</span>
    </div>
  </header>
  <div class="search-wrap">
    <input type="text" class="search-input" placeholder="Search conversations…" id="search" autocomplete="off">
  </div>
  <div class="card-list" id="card-list">
    ${cardsHtml}
  </div>
  <div class="no-results" id="no-results">No matching conversations</div>
</div>
<script>
  // Share button handler via event delegation
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.card-share');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var url = btn.getAttribute('data-url');
    if (url) {
      navigator.clipboard.writeText(url).catch(function(){});
      var icon = ${JSON.stringify(SHARE_ICON)};
      btn.innerHTML = '✓';
      setTimeout(function() { btn.innerHTML = icon; }, 2000);
    }
  });

  // Client-side search
  (function() {
    var input = document.getElementById('search');
    var cards = document.querySelectorAll('.card');
    var noResults = document.getElementById('no-results');
    input.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      var visible = 0;
      cards.forEach(function(card) {
        var match = !q || card.textContent.toLowerCase().indexOf(q) !== -1;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      noResults.style.display = visible === 0 ? 'block' : 'none';
    });
  })();

  ${RELATIVE_TIME_JS}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
