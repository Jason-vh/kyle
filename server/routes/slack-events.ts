import { createLogger } from "../logger.ts";
import { safeJsonParse } from "../json.ts";
import { errorFields } from "../errors.ts";
import { verifySlackSignature } from "../slack/verify.ts";
import { processSlackMessage } from "../slack/handler.ts";
import { shouldProcess, type SlackEventPayload } from "../slack/events.ts";

const log = createLogger("slack:events");

const MAX_SEEN_EVENTS = 10_000;
const seenEvents = new Set<string>();

/** Slack redelivers events; only the first sighting of an ID is worth processing. */
function isFirstSighting(eventId: string): boolean {
  if (seenEvents.has(eventId)) return false;
  if (seenEvents.size >= MAX_SEEN_EVENTS) seenEvents.clear();
  seenEvents.add(eventId);
  return true;
}

export async function handleSlackEvents(req: Request): Promise<Response> {
  const rawBody = await req.text();

  const valid = await verifySlackSignature(
    rawBody,
    req.headers.get("x-slack-request-timestamp"),
    req.headers.get("x-slack-signature"),
  );
  if (!valid) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = safeJsonParse<SlackEventPayload>(rawBody);
  if (!payload) {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (payload.type === "url_verification") {
    return Response.json({ challenge: payload.challenge });
  }

  const ack = new Response("ok", { status: 200 });
  if (req.headers.get("x-slack-retry-num")) return ack;
  if (payload.event_id && !isFirstSighting(payload.event_id)) return ack;

  const event = payload.event;
  if (!event) return ack;
  if (event.type !== "message" && event.type !== "app_mention") return ack;
  if (!shouldProcess(event)) return ack;

  log.info("processing slack message", {
    channel: event.channel,
    eventType: event.type,
    threadTs: event.thread_ts,
  });

  // Tests ask for the reply inline; Slack itself needs an immediate ack.
  if (req.headers.get("x-sync-response") === "true") {
    const response = await processSlackMessage(event, payload.team_id);
    return Response.json({ ok: true, response });
  }

  processSlackMessage(event, payload.team_id).catch((error) => {
    log.error("slack message handler crashed", errorFields(error));
  });
  return ack;
}
