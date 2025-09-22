export type SlackVerificationEvent = {
	type: "url_verification";
	challenge: string;
};

export type SlackAppMentionEvent = {
	type: "app_mention";
	text: string;
	user: string;
	channel: string;
	ts: string;
	event_ts: string;
};

export type SlackAssistantThreadStartedEvent = {
	type: "assistant_thread_started";
	assistant_thread: {
		channel_id: string;
		context: {
			channel_id: string;
			team_id: string;
			enterprise_id?: string;
		};
		thread_ts: string;
	};
	user: string;
	channel: string;
};

/**
 * the message event, as received from Slack
 */
export type SlackMessageEvent = {
	type: "message";
	subtype?: string | "message_changed";
	text: string;
	user: string;
	channel_type: "im" | "group" | "channel" | "mpim";
	channel: string;
	bot_profile?: {
		id: string;
		name: string;
		real_name: string;
		email: string;
		image_original: string;
	};
};

export type SlackEvent = (
	| SlackAppMentionEvent
	| SlackAssistantThreadStartedEvent
	| SlackMessageEvent
) & {
	ts: string;
	thread_ts: string;
	channel: string;
};

export type SlackEventCallback = {
	type: "event_callback";
	event: SlackEvent;
};

export type SlackEventType =
	| "assistant_thread_started"
	| "assistant_thread_context_changed"
	| "message"
	| "app_mention";

export type SlackEventBody = SlackVerificationEvent | SlackEventCallback;

// Message object returned by Web API methods like conversations.replies
export type SlackMessageObject = {
	type: string;
	ts: string;
	text?: string;
	user?: string;
	thread_ts?: string;
	subtype?: string | "assistant_app_thread";
	bot_id?: string;
	bot_profile?: {
		id: string;
		name: string;
		real_name?: string;
		email?: string;
		image_original?: string;
	};
	reactions?: Array<{
		name: string;
		count: number;
		users: string[];
	}>;
	reply_count?: number;
	reply_users?: string[];
	reply_users_count?: number;
	replies?: Array<{
		user: string;
		ts: string;
	}>;
	edited?: {
		user: string;
		ts: string;
	};
};

// Response shape for conversations.replies
export type SlackConversationsRepliesResponse = {
	ok: true;
	messages: SlackMessageObject[];
	has_more?: boolean;
	response_metadata?: {
		next_cursor?: string;
	};
};

// Minimal Slack user profile fields we care about
export type SlackUserProfile = {
	display_name?: string;
	real_name?: string;
};

// Minimal Slack user object shape from users.info
export type SlackUserObject = {
	id: string;
	name?: string;
	real_name?: string;
	profile?: SlackUserProfile;
};

// Response shape for users.info
export type SlackUsersInfoResponse = {
	ok: true;
	user: SlackUserObject;
};
