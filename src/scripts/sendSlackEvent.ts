import "dotenv/config";

type Args = {
	text: string;
	thread?: string;
	channel?: string;
	user?: string;
	url?: string;
};

function parseArgs(): Args {
	const args = process.argv.slice(2);
	const result: Args = { text: "hello from script" };

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const next = args[i + 1];
		switch (arg) {
			case "--text":
				if (next) (result.text = next), i++;
				break;
			case "--thread":
				if (next) (result.thread = next), i++;
				break;
			case "--channel":
				if (next) (result.channel = next), i++;
				break;
			case "--user":
				if (next) (result.user = next), i++;
				break;
			case "--url":
				if (next) (result.url = next), i++;
				break;
			default:
				break;
		}
	}

	return result;
}

function nowSlackTs(): string {
	const nowMs = Date.now();
	const seconds = Math.floor(nowMs / 1000);
	const remainder = String(nowMs % 1000).padStart(3, "0");
	return `${seconds}.${remainder}`;
}

async function main() {
	const {
		text,
		thread,
		channel = process.env.SLACK_TEST_CHANNEL_ID || "C09BQP3GGJF",
		user = process.env.SLACK_TEST_USER_ID || "UPGT38Z8F",
		// env-only values below
		// no flags for these
		url,
	} = parseArgs();

	const baseTs = thread || nowSlackTs();
	const ts = baseTs;
	const thread_ts = baseTs;
	const channelType = channel?.startsWith("D") ? "im" : "channel";

	const team = "TPGT38Y9M";
	const appId = "A0983F5N67K";
	const botUserId = "U099N4BJT5Y";

	const body = {
		authorizations: [
			{
				is_bot: true,
				is_enterprise_install: false,
				team_id: team,
				user_id: botUserId,
			},
		],
		is_ext_shared_channel: false,
		token: "test-token",
		team_id: team,
		context_team_id: team,
		api_app_id: appId,
		type: "event_callback" as const,
		event_id: `Ev${Math.random().toString(36).slice(2)}`,
		event_time: Math.floor(Date.now() / 1000),
		event_context: "test",
		event: {
			type: "message" as const,
			user,
			ts,
			client_msg_id: crypto.randomUUID(),
			text,
			team,
			thread_ts,
			channel: channel,
			event_ts: ts,
			channel_type: channelType,
			blocks: [
				{
					type: "rich_text",
					block_id: "/QgiX",
					elements: [
						{
							type: "rich_text_section",
							elements: [{ type: "text", text }],
						},
					],
				},
			],
		},
	};

	const targetUrl = url || `http://localhost:3000/kyle/slack/events`;
	const res = await fetch(targetUrl, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

	const textRes = await res.text();
	console.log("status:", res.status);
	console.log(textRes);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
