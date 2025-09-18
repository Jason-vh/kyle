export type MessageWithContext = {
	text: string;
	user: {
		id: string;
		username: string;
	};
	history: Omit<MessageWithContext, "history">[];
};
