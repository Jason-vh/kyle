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
	subtype?: string | "message_changed" | "bot_message";
	streaming_state?: "in_progress" | "completed";
	text: string;
	user: string;
	channel_type: "im" | "group" | "channel" | "mpim";
	channel: string;
	team?: string;
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

// Block Kit Types
export type SlackTextObject = {
	type: "plain_text" | "mrkdwn";
	text: string;
	emoji?: boolean;
	verbatim?: boolean;
};

export type SlackButtonElement = {
	type: "button";
	text: SlackTextObject;
	action_id: string;
	url?: string;
	value?: string;
	style?: "primary" | "danger";
	confirm?: SlackConfirmationDialog;
	accessibility_label?: string;
};

export type SlackSelectElement = {
	type:
		| "static_select"
		| "external_select"
		| "users_select"
		| "conversations_select"
		| "channels_select";
	placeholder: SlackTextObject;
	action_id: string;
	options?: SlackOption[];
	option_groups?: SlackOptionGroup[];
	initial_option?: SlackOption;
	initial_user?: string;
	initial_conversation?: string;
	initial_channel?: string;
	confirm?: SlackConfirmationDialog;
	max_selected_items?: number;
	filter?: {
		include?: string[];
		exclude_external_shared_channels?: boolean;
		exclude_bot_users?: boolean;
	};
};

export type SlackOverflowElement = {
	type: "overflow";
	action_id: string;
	options: SlackOption[];
	confirm?: SlackConfirmationDialog;
};

export type SlackDatePickerElement = {
	type: "datepicker";
	action_id: string;
	placeholder?: SlackTextObject;
	initial_date?: string;
	confirm?: SlackConfirmationDialog;
};

export type SlackTimePickerElement = {
	type: "timepicker";
	action_id: string;
	placeholder?: SlackTextObject;
	initial_time?: string;
	confirm?: SlackConfirmationDialog;
};

export type SlackRadioButtonsElement = {
	type: "radio_buttons";
	action_id: string;
	options: SlackOption[];
	initial_option?: SlackOption;
	confirm?: SlackConfirmationDialog;
};

export type SlackCheckboxesElement = {
	type: "checkboxes";
	action_id: string;
	options: SlackOption[];
	initial_options?: SlackOption[];
	confirm?: SlackConfirmationDialog;
};

export type SlackPlainTextInputElement = {
	type: "plain_text_input";
	action_id: string;
	placeholder?: SlackTextObject;
	initial_value?: string;
	multiline?: boolean;
	min_length?: number;
	max_length?: number;
	dispatch_action_config?: {
		trigger_actions_on?: ("on_enter_pressed" | "on_character_entered")[];
	};
};

export type SlackElement =
	| SlackButtonElement
	| SlackSelectElement
	| SlackOverflowElement
	| SlackDatePickerElement
	| SlackTimePickerElement
	| SlackRadioButtonsElement
	| SlackCheckboxesElement
	| SlackImageBlock
	| SlackPlainTextInputElement;

export type SlackOption = {
	text: SlackTextObject;
	value: string;
	description?: SlackTextObject;
	url?: string;
};

export type SlackOptionGroup = {
	label: SlackTextObject;
	options: SlackOption[];
};

export type SlackConfirmationDialog = {
	title: SlackTextObject;
	text: SlackTextObject;
	confirm: SlackTextObject;
	deny: SlackTextObject;
	style?: "primary" | "danger";
};

export type SlackSectionBlock = {
	type: "section";
	text?: SlackTextObject;
	block_id?: string;
	fields?: SlackTextObject[];
	accessory?: SlackElement;
};

export type SlackDividerBlock = {
	type: "divider";
	block_id?: string;
};

export type SlackImageBlock = {
	type: "image";
	image_url: string;
	alt_text: string;
	block_id?: string;
	title?: SlackTextObject;
};

export type SlackActionsBlock = {
	type: "actions";
	elements: SlackElement[];
	block_id?: string;
};

export type SlackContextBlock = {
	type: "context";
	elements: (
		| SlackTextObject
		| { type: "image"; image_url: string; alt_text: string }
	)[];
	block_id?: string;
};

export type SlackInputBlock = {
	type: "input";
	label: SlackTextObject;
	element: SlackElement;
	dispatch_action?: boolean;
	block_id?: string;
	hint?: SlackTextObject;
	optional?: boolean;
};

export type SlackFileBlock = {
	type: "file";
	external_id: string;
	block_id?: string;
	source: "remote";
};

export type SlackHeaderBlock = {
	type: "header";
	text: SlackTextObject;
	block_id?: string;
};

export type SlackVideoBlock = {
	type: "video";
	video_url: string;
	thumbnail_url: string;
	alt_text: string;
	title: SlackTextObject;
	block_id?: string;
	title_url?: string;
	author_name?: string;
	provider_name?: string;
	provider_icon_url?: string;
	description?: SlackTextObject;
};

export type SlackBlock =
	| SlackSectionBlock
	| SlackDividerBlock
	| SlackImageBlock
	| SlackActionsBlock
	| SlackContextBlock
	| SlackInputBlock
	| SlackFileBlock
	| SlackHeaderBlock
	| SlackVideoBlock;
