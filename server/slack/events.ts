import { SUPPORTED_IMAGE_TYPES } from "#server/images.ts";
import { isObject, isText } from "#server/http/input.ts";

export interface SlackFile {
  id: string;
  mimetype: string;
  url_private: string;
  name?: string;
  size?: number;
}

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
  files?: SlackFile[];
  /** Present on message events once agent_view and app_context_changed are enabled. */
  app_context?: { entities?: Array<{ type: string; value: string }> };
}

export const BOT_USER_ID = "U099N4BJT5Y";

export interface SlackEventPayload {
  type: string;
  token?: string;
  challenge?: string;
  event_id?: string;
  team_id?: string;
  event?: SlackEvent;
}

export function isSlackEvent(value: unknown): value is SlackEvent {
  if (!isObject(value) || !isText(value.type) || !isText(value.channel) || !isText(value.ts))
    return false;
  for (const key of ["subtype", "channel_type", "user", "text", "thread_ts", "bot_id"]) {
    if (value[key] !== undefined && typeof value[key] !== "string") return false;
  }
  if (
    value.files !== undefined &&
    (!Array.isArray(value.files) ||
      !value.files.every(
        (file) =>
          isObject(file) &&
          isText(file.id) &&
          isText(file.mimetype) &&
          isText(file.url_private) &&
          (file.name === undefined || typeof file.name === "string") &&
          (file.size === undefined ||
            (typeof file.size === "number" && Number.isSafeInteger(file.size) && file.size >= 0)),
      ))
  )
    return false;
  if (value.app_context !== undefined) {
    if (!isObject(value.app_context)) return false;
    const entities = value.app_context.entities;
    if (
      entities !== undefined &&
      (!Array.isArray(entities) ||
        !entities.every(
          (entity) => isObject(entity) && isText(entity.type) && isText(entity.value),
        ))
    )
      return false;
  }
  return true;
}

export function threadExternalId(channel: string, threadTs: string): string {
  return `${channel}:${threadTs}`;
}

export function buildExternalId(event: SlackEvent): string {
  return threadExternalId(event.channel, event.thread_ts ?? event.ts);
}

export function getImageFiles(files?: SlackFile[]): SlackFile[] {
  return (files ?? []).filter((f) => SUPPORTED_IMAGE_TYPES.has(f.mimetype));
}

/** Subtypes that are still a person writing to Kyle. */
const ANSWERED_SUBTYPES = new Set(["file_share", "thread_broadcast"]);

/** Whether a message has anything to answer, wherever it was sent. */
export function shouldProcess(event: SlackEvent): boolean {
  if (event.bot_id) return false;
  if (event.subtype && !ANSWERED_SUBTYPES.has(event.subtype)) return false;

  const hasText = !!event.text?.trim();
  const hasImages = getImageFiles(event.files).length > 0;
  return hasText || hasImages;
}

export function mentionsKyle(event: SlackEvent): boolean {
  return !!event.text?.includes(`<@${BOT_USER_ID}>`);
}

export function isThreadReply(event: SlackEvent): boolean {
  return !!event.thread_ts && event.thread_ts !== event.ts;
}

function decodeSlackEntities(text: string): string {
  return text.replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}

export function cleanMessageText(text: string, usernameMap?: Map<string, string>): string {
  if (usernameMap) {
    return decodeSlackEntities(
      text
        .replace(/<@([A-Z0-9]+)>/g, (_, id) => {
          const name = usernameMap.get(id);
          return name ? `@${name}` : "";
        })
        .trim(),
    );
  }
  return decodeSlackEntities(text.replace(/<@[A-Z0-9]+>/g, "").trim());
}
