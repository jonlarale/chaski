export type AssistantRole = 'user' | 'assistant';

export type AssistantStatus = 'idle' | 'thinking' | 'error';

export type AssistantMessage = {
	id: string;
	role: AssistantRole;
	content: string;
	createdAt: Date;
};

export type AssistantContextSnapshot = {
	account?: string;
	folder?: string;
	messages: Array<{
		id: string;
		subject?: string;
		from?: string;
		preview?: string;
		date?: string;
	}>;
};

export type AssistantResponse = {
	reply: string;
	usedMessages: AssistantContextSnapshot['messages'];
};

export type AssistantOptions = {
	model?: string;
	maxContextMessages?: number;
};

export type AssistantError = {
	message: string;
};
