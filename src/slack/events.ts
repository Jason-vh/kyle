export interface SlackEvent {
  type: string;
  subtype?: string;
  channel: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

export const BOT_USER_ID = "U099N4BJT5Y";

export interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  event_id?: string;
  event?: SlackEvent;
}

export function buildExternalId(event: SlackEvent): string {
  const threadTs = event.thread_ts ?? event.ts;
  return `${event.channel}:${threadTs}`;
}

export function shouldProcess(event: SlackEvent): boolean {
  if (event.bot_id) return false;
  if (event.subtype) return false;
  if (!event.text?.trim()) return false;

  // DMs always pass through; channels require @mention
  if (event.channel_type !== "im") {
    if (!event.text.includes(`<@${BOT_USER_ID}>`)) return false;
  }

  return true;
}

export function cleanMessageText(
  text: string,
  usernameMap?: Map<string, string>
): string {
  if (usernameMap) {
    return text
      .replace(/<@([A-Z0-9]+)>/g, (_, id) => {
        const name = usernameMap.get(id);
        return name ? `@${name}` : "";
      })
      .trim();
  }
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}
