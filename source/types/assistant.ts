export type AssistantRole = 'user' | 'assistant';

export type AssistantStatus = 'idle' | 'thinking' | 'error';

export interface AssistantMessage {
	id: string;
	role: AssistantRole;
	content: string;
	createdAt: Date;
}

export interface AssistantContextSnapshot {
	account?: string;
	folder?: string;
	messages: Array<{
		id: string;
		subject?: string;
		from?: string;
		preview?: string;
		date?: string;
	}>;
}

export interface AssistantResponse {
	reply: string;
	usedMessages: AssistantContextSnapshot['messages'];
}

export interface AssistantOptions {
	model?: string;
	maxContextMessages?: number;
}

export interface AssistantError {
	message: string;
}
