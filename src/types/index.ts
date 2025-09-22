export type MessageWithContext = {
	text: string;
	user: {
		id: string;
		username: string;
	};
	history: Omit<MessageWithContext, "history">[];
};

export type SlackContext = {
	// these fields are used to identify the request
	request_id: string;
	timestamp: string;

	// and these fields are used to interact in Slack
	slack_thread_ts: string;
	slack_channel_id: string;
};
