export interface SlackEvent {
  type: string;
  subtype?: string;
  channel: string;
  user?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

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
  return true;
}

export function cleanMessageText(text: string): string {
  return text.replace(/<@[A-Z0-9]+>/g, "").trim();
}
