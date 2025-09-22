import type { SlackEventBody } from "@/lib/slack/types";
import { parseArgs } from "util";

const DEFAULT_CHANNEL = "D099N4BMT6E";
const DEFAULT_USER = "UPGT38Z8F";
const DEFAULT_URL = "https://jasonvh.rigel.usbx.me/kyle";

const CLI_OPTIONS = {
	text: { type: "string", short: "t" },
	thread: { type: "string", short: "t" },
	channel: { type: "string", default: DEFAULT_CHANNEL },
	user: { type: "string", default: DEFAULT_USER },
	url: { type: "string", default: DEFAULT_URL, short: "u" },
} as const;

async function main() {
	const args = parseArgs({
		args: Bun.argv,
		options: CLI_OPTIONS,
		strict: true,
		allowPositionals: true,
	});

	const { text, thread: threadTs, channel, user, url } = args.values;

	if (!threadTs) {
		throw new Error("The thread argument is required");
	}

	if (!text) {
		throw new Error("The text argument is required");
	}

	const channelType = channel?.startsWith("D") ? "im" : "channel";

	const body: SlackEventBody = {
		type: "event_callback",
		event: {
			type: "message",
			user,
			ts: threadTs,
			text,
			thread_ts: threadTs,
			channel: channel,
			channel_type: channelType,
		},
	};

	const webhookURL = `${url}/slack/events`;

	console.log("sending event to", webhookURL);
	console.log("body:", body);

	const res = await fetch(webhookURL, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

	const textRes = await res.text();

	console.log("status:", res.status);
	console.log(textRes);
}

try {
	await main();
} catch (err) {
	console.error(err);
	process.exit(1);
}
