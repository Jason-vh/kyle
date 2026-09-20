import { createLogger } from "#server/logger.ts";
import { safeJsonParse } from "#server/json.ts";
import { errorFields } from "#server/errors.ts";
import { verifySlackSignature } from "#server/slack/verify.ts";
import { enqueueSlackEvent, processSlackEvent } from "#server/slack/jobs.ts";
import { shouldProcess, type SlackEventPayload } from "#server/slack/events.ts";

const log = createLogger("slack:events");

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
  const event = payload.event;
  if (!event) return ack;
  if (event.type !== "message" && event.type !== "app_mention") return ack;
  if (!shouldProcess(event)) return ack;
  if (typeof payload.event_id !== "string" || !payload.event_id) {
    return Response.json({ error: "event_id is required" }, { status: 400 });
  }

  await enqueueSlackEvent(payload.event_id, event, payload.team_id);

  log.info("processing slack message", {
    channel: event.channel,
    eventType: event.type,
    threadTs: event.thread_ts,
  });

  // Tests ask for the reply inline; Slack itself needs an immediate ack.
  if (req.headers.get("x-sync-response") === "true") {
    const response = await processSlackEvent(payload.event_id);
    return Response.json({ ok: true, response });
  }

  processSlackEvent(payload.event_id).catch((error) => {
    log.error("slack message handler crashed", errorFields(error));
  });
  return ack;
}
