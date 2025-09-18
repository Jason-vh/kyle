export interface SlackEvent {
	type: string;
	event?: {
		type: string;
		text?: string;
		user?: string;
		channel?: string;
		ts?: string;
		thread_ts?: string;
		bot_id?: string;
	};
	challenge?: string;
	team_id?: string;
	api_app_id?: string;
	event_id?: string;
	event_time?: number;
}

export interface SlackMessage {
	text: string;
	channel: string;
	thread_ts?: string;
	user?: string;
}

export interface SlackResponse {
	ok: boolean;
	error?: string;
	ts?: string;
	channel?: string;
}