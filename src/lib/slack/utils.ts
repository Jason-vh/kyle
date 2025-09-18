import { createLogger } from "@/lib/logger";
import { SlackClient } from "@/lib/slack/client";
import {
	SlackConversationsRepliesResponse,
	SlackMessageEvent,
} from "@/lib/slack/types";
import { MessageWithContext } from "@/types";
import { BOT_USER_ID } from "./constants";

const logger = createLogger("slack/utils");

function cleanMessageText(
	input: string | undefined,
	usernameMap: Map<string, string>
): string {
	if (!input) {
		return "<empty message>";
	}

	return input.replace(/<@([^>|]+)(?:\|[^>]+)?>/g, (match, uid) => {
		const username = usernameMap.get(uid);
		return `@<${username ? username : match}>`;
	});
}

/**
 * we want to add some extra information to a Slack message:
 * - who sent it (including the name)
 * - any history preceding it, if in a thread
 */
export async function buildMessageContext(
	threadTs: string,
	message: SlackMessageEvent,
	slackClient: SlackClient
): Promise<MessageWithContext> {
	logger.debug("building message context", { event: message });

	let threadHistory: SlackConversationsRepliesResponse;
	try {
		threadHistory = await slackClient.conversationsReplies(
			message.channel,
			threadTs,
			20
		);
	} catch (err) {
		logger.error("failed to fetch thread history", { err });
		return {
			text: message.text,
			user: {
				id: message.user,
				username: message.user,
			},
			history: [],
		};
	}

	// we get user IDs from the thread history
	const userIds = threadHistory.messages
		.map((m) => m.user)
		.filter((u): u is string => Boolean(u));

	// and from any mentions within the messages
	const mentions = threadHistory.messages
		.map((m) => m.text)
		.filter((t): t is string => Boolean(t))
		.flatMap((t) => t.match(/<@([^>|]+)(?:\|[^>]+)?>/g) ?? []);

	const mentionUserIds = mentions.map((m) =>
		m.replace(/<@([^>|]+)(?:\|[^>]+)?>/g, "$1")
	);

	const uniqueUserIds = Array.from(new Set([...userIds, ...mentionUserIds]));

	const usernameMap = new Map<string, string>([[BOT_USER_ID, "Kyle"]]);
	for (const userId of uniqueUserIds) {
		try {
			const info = await slackClient.usersInfo(userId);
			const profileName =
				info.user.profile?.display_name ||
				info.user.profile?.real_name ||
				info.user.real_name ||
				info.user.name ||
				userId;
			usernameMap.set(userId, profileName);
		} catch (err) {
			logger.error("failed to fetch user info", { userId, err });
			usernameMap.set(userId, userId);
		}
	}

	const history: MessageWithContext["history"] = threadHistory.messages
		.filter((m) => m.subtype !== "assistant_app_thread")
		.map((m) => {
			const username =
				usernameMap.get(m.user ?? "") ?? m.user ?? "<unknown user>";

			return {
				text: cleanMessageText(m.text, usernameMap),
				user: {
					id: m.user ?? "<unknown user>",
					username,
				},
			};
		});

	return {
		text: cleanMessageText(message.text, usernameMap),
		user: {
			id: message.user,
			username: usernameMap.get(message.user) ?? message.user,
		},
		history,
	};
}
