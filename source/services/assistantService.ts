import process from 'node:process';
import OpenAI from 'openai';
import type {EmailMessage} from '../types/email.js';
import type {
	AssistantContextSnapshot,
	AssistantMessage,
	AssistantOptions,
	AssistantResponse,
} from '../types/assistant.js';

const defaultModel = 'gpt-4o-mini';
const defaultMaxContextMessages = 12;
const defaultHistoryLength = 6;

export class AssistantService {
	private readonly client: OpenAI | undefined;
	private readonly model: string;
	private readonly maxContextMessages: number;
	private readonly maxHistory: number;

	constructor(options: AssistantOptions = {}) {
		const apiKey =
			process.env['OPENAI_API_KEY'] ??
			process.env['OPENAI_KEY'] ??
			process.env['OPENAI_TOKEN'];

		this.client = apiKey ? new OpenAI({apiKey}) : undefined;
		this.model = options.model ?? defaultModel;
		this.maxContextMessages =
			options.maxContextMessages ?? defaultMaxContextMessages;
		this.maxHistory = defaultHistoryLength;
	}

	isEnabled(): boolean {
		return this.client !== undefined;
	}

	getModel(): string {
		return this.model;
	}

	buildContextSnapshot(
		emails: EmailMessage[],
		metadata: {account?: string; folder?: string} = {},
	): AssistantContextSnapshot {
		const limited = emails.slice(0, this.maxContextMessages);
		return {
			...metadata,
			messages: limited.map(email => {
				const from = Array.isArray(email.from)
					? email.from
							.map(entry =>
								entry.name ? `${entry.name} <${entry.address}>` : entry.address,
							)
							.filter(Boolean)
							.join(', ')
					: undefined;

				return {
					id:
						email.id ||
						`${email.accountId ?? 'unknown'}:${email.uid ?? 'unknown'}`,
					subject: email.subject,
					from,
					preview: email.body?.text ?? email.body?.html ?? '',
					date:
						email.date instanceof Date
							? email.date.toISOString()
							: email.date
							? String(email.date)
							: undefined,
				};
			}),
		};
	}

	async createResponse(parameters: {
		prompt: string;
		history: AssistantMessage[];
		context: AssistantContextSnapshot;
	}): Promise<AssistantResponse> {
		if (!this.client) {
			throw new Error('OpenAI API key not configured.');
		}

		const {prompt, history, context} = parameters;
		const trimmedHistory = this.selectHistory(history);

		const systemMessage = `You are an assistant embedded in the Chaski mail client. Only answer using details provided in the email context. If the user question cannot be solved with that context, state that you do not have enough information. Mirror the user's language and never invent details.`;

		const contextText = this.buildContextText(context);

		const messages = [
			{role: 'system' as const, content: systemMessage},
			...trimmedHistory.map(entry => ({
				role: entry.role,
				content: entry.content,
			})),
			{
				role: 'user' as const,
				content: `Available context:\n\n${contextText}\n\nUser question:\n${prompt}`,
			},
		];

		const response = await this.client.chat.completions.create({
			model: this.model,
			messages,
			temperature: 0.4,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			max_tokens: 600,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			presence_penalty: 0,
			// eslint-disable-next-line @typescript-eslint/naming-convention
			frequency_penalty: 0,
		});

		const reply = response.choices?.[0]?.message?.content?.trim();
		if (!reply) {
			throw new Error('The model did not return a response.');
		}

		return {
			reply,
			usedMessages: context.messages,
		};
	}

	private buildContextText(snapshot: AssistantContextSnapshot): string {
		if (snapshot.messages.length === 0) {
			return 'No email messages are available in the context.';
		}

		const headerParts = [] as string[];
		if (snapshot.account) headerParts.push(`Cuenta: ${snapshot.account}`);
		if (snapshot.folder) headerParts.push(`Carpeta: ${snapshot.folder}`);

		const header =
			headerParts.length > 0
				? `Context (${headerParts.join(' · ')}):`
				: 'Message context:';

		const messageSummaries = snapshot.messages.map((message, index) => {
			const lines = [
				`Message ${index + 1}:`,
				message.subject ? `Subject: ${message.subject}` : null,
				message.from ? `From: ${message.from}` : null,
				message.date ? `Date: ${message.date}` : null,
				message.preview ? `Preview: ${message.preview}` : null,
			].filter(Boolean);
			return lines.join('\n');
		});

		return `${header}\n\n${messageSummaries.join('\n\n')}`;
	}

	private selectHistory(history: AssistantMessage[]): AssistantMessage[] {
		if (history.length <= this.maxHistory) {
			return history;
		}

		return history.slice(history.length - this.maxHistory);
	}
}

export default AssistantService;
