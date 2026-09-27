import type { ThreadListItem } from "#shared/types.ts";
import type { ThreadSummaryRow } from "#server/db/threads.ts";
import { safeJsonParse } from "#server/json.ts";
import { createLogger } from "#server/logger.ts";
import { stripMentions } from "./items.ts";

const log = createLogger("thread-summaries");

export function toThreadListItem(row: ThreadSummaryRow): ThreadListItem {
  const mediaRefs = row.mediaRefsJson
    ? safeJsonParse<{ action: string; title: string }[]>(row.mediaRefsJson)
    : [];
  if (!mediaRefs) log.warn("unparseable media refs", { conversationId: row.id });

  return {
    id: row.id,
    interfaceType: row.interfaceType,
    preview: stripMentions(row.preview || "") || "Untitled conversation",
    messageCount: row.messageCount ?? 0,
    createdAt: row.createdAt.toISOString(),
    mediaRefs: mediaRefs ?? [],
  };
}
