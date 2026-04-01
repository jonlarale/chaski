import {type McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {type EmailService} from '../services/emailService.js';
import {type CacheService} from '../services/cacheService.js';
import {type AssistantService} from '../services/assistantService.js';
import {type SettingsService} from '../services/settingsService.js';
import {type DownloadService} from '../services/downloadService.js';
import {type EmailMessage} from '../types/email.js';
import {sanitizeAccount} from './sanitize.js';
import {
	accountIdSchema,
	folderRefSchema,
	messageRefSchema,
	listMessagesSchema,
	sendMailSchema,
	searchMessagesSchema,
	assistantQuerySchema,
	downloadAttachmentSchema,
	refreshFolderSchema,
} from './schemas.js';

export type ServiceContainer = {
	emailService: EmailService;
	cacheService: CacheService;
	assistantService: AssistantService;
	settingsService: SettingsService;
	downloadService: DownloadService;
};

function errorResult(message: string) {
	return {
		content: [{type: 'text' as const, text: `Error: ${message}`}],
		isError: true as const,
	};
}

function jsonResult(data: unknown) {
	return {
		content: [{type: 'text' as const, text: JSON.stringify(data, null, 2)}],
	};
}

export function registerTools(server: McpServer, services: ServiceContainer) {
	const {emailService, cacheService, assistantService, downloadService} =
		services;

	// ── Account tools ──────────────────────────────────────────────

	server.tool(
		'list-accounts',
		'List all configured email accounts (credentials are never exposed)',
		{},
		async () => {
			try {
				const accounts = await emailService.getAccounts();
				return jsonResult(accounts.map(a => sanitizeAccount(a)));
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Folder tools ───────────────────────────────────────────────

	server.tool(
		'list-folders',
		'List all folders/mailboxes for an email account',
		accountIdSchema,
		async ({accountId}) => {
			try {
				const folders = await emailService.getFolders(accountId);
				return jsonResult(folders);
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'get-folder-status',
		'Get message counts (total, unseen) for a folder',
		folderRefSchema,
		async ({accountId, folder}) => {
			try {
				const status = await emailService.getFolderStatus(accountId, folder);
				return jsonResult(status);
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Message tools ──────────────────────────────────────────────

	server.tool(
		'list-messages',
		'List messages in a folder (reads from local cache for speed; use refresh-folder to sync from server first)',
		listMessagesSchema,
		async ({accountId, folder, limit, offset}) => {
			try {
				const messages = await cacheService.getCachedMessages(
					folder,
					accountId,
					limit,
					offset,
				);
				// Strip body content to keep response compact
				const summaries = messages.map(m => ({
					uid: m.uid,
					subject: m.subject,
					from: m.from,
					date: m.date,
					flags: m.flags,
					hasAttachments: m.attachments && m.attachments.length > 0,
					preview: m.body?.text?.slice(0, 150),
				}));
				return jsonResult({
					folder,
					accountId,
					count: summaries.length,
					messages: summaries,
				});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'read-message',
		'Read a single email message with its full body content',
		messageRefSchema,
		async ({accountId, folder, uid}) => {
			try {
				const message = await emailService.getMessage(accountId, folder, uid);
				if (!message) {
					return errorResult(`Message with UID ${uid} not found in ${folder}`);
				}

				// Strip attachment buffers, keep metadata
				const result = {
					...message,
					attachments: message.attachments?.map((att, index) => ({
						index,
						filename: att.filename,
						contentType: att.contentType,
						size: att.size,
					})),
				};
				return jsonResult(result);
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'get-thread',
		'Get all messages in a conversation thread',
		{
			accountId: messageRefSchema.accountId,
			folder: messageRefSchema.folder,
			messageId: messageRefSchema.uid,
		},
		async parameters => {
			try {
				// First fetch the original message to get references
				const original = await emailService.getMessage(
					parameters.accountId,
					parameters.folder,
					parameters.messageId,
				);
				if (!original) {
					return errorResult('Original message not found');
				}

				const references = original.references ?? [];
				if (original.messageId) {
					references.push(original.messageId);
				}

				const threadMessages = await emailService.getThreadMessages(
					parameters.accountId,
					parameters.folder,
					original.messageId,
					references,
				);

				const summaries = threadMessages.map(m => ({
					uid: m.uid,
					subject: m.subject,
					from: m.from,
					date: m.date,
					bodyText: m.body?.text,
				}));
				return jsonResult({threadSize: summaries.length, messages: summaries});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'search-messages',
		'Search cached messages by subject or sender name/address',
		searchMessagesSchema,
		async ({accountId, folder, query, limit}) => {
			try {
				// Fetch a larger set from cache and filter in memory
				const allMessages = await cacheService.getCachedMessages(
					folder,
					accountId,
					500,
					0,
				);
				const lowerQuery = query.toLowerCase();
				const matches = allMessages
					.filter(m => {
						const subject = (m.subject ?? '').toLowerCase();
						const fromName = (m.from[0]?.name ?? '').toLowerCase();
						const fromAddress = (m.from[0]?.address ?? '').toLowerCase();
						const preview = (m.body?.text ?? '').toLowerCase();
						return (
							subject.includes(lowerQuery) ||
							fromName.includes(lowerQuery) ||
							fromAddress.includes(lowerQuery) ||
							preview.includes(lowerQuery)
						);
					})
					.slice(0, limit)
					.map(m => ({
						uid: m.uid,
						subject: m.subject,
						from: m.from,
						date: m.date,
						flags: m.flags,
						preview: m.body?.text?.slice(0, 150),
					}));

				return jsonResult({
					query,
					folder,
					accountId,
					count: matches.length,
					messages: matches,
				});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Action tools ───────────────────────────────────────────────

	server.tool(
		'send-email',
		'Send an email. For replies, include inReplyTo and references fields.',
		sendMailSchema,
		async ({
			accountId,
			to,
			subject,
			text,
			cc,
			bcc,
			html,
			inReplyTo,
			references,
		}) => {
			try {
				const messageId = await emailService.sendMail(accountId, {
					to: to.split(',').map(s => s.trim()),
					subject,
					text,
					...(cc && {cc: cc.split(',').map(s => s.trim())}),
					...(bcc && {bcc: bcc.split(',').map(s => s.trim())}),
					...(html && {html}),
					...(inReplyTo && {inReplyTo}),
					...(references && {references: references.split(' ')}),
				});
				return jsonResult({success: true, messageId});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'mark-as-read',
		'Mark a message as read',
		messageRefSchema,
		async ({accountId, folder, uid}) => {
			try {
				await emailService.markAsRead(accountId, folder, uid);
				await cacheService.updateMessageFlags(String(uid), folder, accountId, [
					'\\Seen',
				]);
				return jsonResult({success: true, uid, folder});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'delete-message',
		'Delete a message (moves to trash or marks as deleted depending on provider)',
		messageRefSchema,
		async ({accountId, folder, uid}) => {
			try {
				await emailService.deleteMessage(accountId, folder, uid);
				return jsonResult({success: true, uid, folder});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	server.tool(
		'refresh-folder',
		'Sync messages from the IMAP server into the local cache. Use this before list-messages to get fresh data.',
		refreshFolderSchema,
		async ({accountId, folder, limit}) => {
			try {
				const messages = await emailService.getMessages(
					accountId,
					folder,
					limit,
				);
				await cacheService.updateMessages(messages, folder, accountId);

				// Update folder metadata
				const status = await emailService.getFolderStatus(accountId, folder);
				await cacheService.updateFolderMetadata(
					folder,
					accountId,
					status.total,
					status.unseen,
				);

				return jsonResult({
					success: true,
					folder,
					messagesFetched: messages.length,
					total: status.total,
					unseen: status.unseen,
				});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Cache tools ────────────────────────────────────────────────

	server.tool(
		'get-cache-status',
		'Get statistics about the local message cache',
		{},
		async () => {
			try {
				const stats = await cacheService.getCacheStats();
				return jsonResult(stats);
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Assistant tools ────────────────────────────────────────────

	server.tool(
		'ask-assistant',
		'Ask the AI assistant a question about your emails. Requires OPENAI_API_KEY to be configured.',
		assistantQuerySchema,
		async ({prompt, accountId, folder}) => {
			try {
				if (!assistantService.isEnabled()) {
					return errorResult(
						'AI assistant is not enabled. Set OPENAI_API_KEY in your environment.',
					);
				}

				// Build context from cached messages
				const targetFolder = folder ?? 'INBOX';
				let contextMessages: EmailMessage[] = [];

				if (accountId) {
					contextMessages = await cacheService.getCachedMessages(
						targetFolder,
						accountId,
						20,
						0,
					);
				} else {
					// Get messages from all accounts
					const accounts = await emailService.getAccounts();
					const allMessages: EmailMessage[] = [];
					for (const account of accounts) {
						// eslint-disable-next-line no-await-in-loop
						const messages = await cacheService.getCachedMessages(
							targetFolder,
							account.id,
							10,
							0,
						);
						allMessages.push(...messages);
					}

					contextMessages = allMessages
						.sort(
							(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
						)
						.slice(0, 20);
				}

				const context = assistantService.buildContextSnapshot(contextMessages, {
					account: accountId,
					folder: targetFolder,
				});

				const response = await assistantService.createResponse({
					prompt,
					history: [],
					context,
				});

				return jsonResult({
					reply: response.reply,
					contextMessagesUsed: response.usedMessages.length,
				});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);

	// ── Download tools ─────────────────────────────────────────────

	server.tool(
		'download-attachment',
		'Download an email attachment to disk. Returns the file path on success.',
		downloadAttachmentSchema,
		async ({accountId, folder, uid, attachmentIndex}) => {
			try {
				const message = await emailService.getMessage(accountId, folder, uid);
				if (!message) {
					return errorResult(`Message with UID ${uid} not found`);
				}

				if (!message.attachments || message.attachments.length === 0) {
					return errorResult('This message has no attachments');
				}

				if (attachmentIndex >= message.attachments.length) {
					return errorResult(
						`Attachment index ${attachmentIndex} out of range. Message has ${message.attachments.length} attachment(s).`,
					);
				}

				const attachment = message.attachments[attachmentIndex]!;
				const result = await downloadService.downloadAttachment({
					filename: attachment.filename,
					contentType: attachment.contentType,
					size: attachment.size,
					content: attachment.content,
				});

				if (!result.success) {
					return errorResult(result.error ?? 'Download failed');
				}

				return jsonResult({
					success: true,
					filePath: result.filePath,
					filename: attachment.filename,
					size: attachment.size,
				});
			} catch (error: unknown) {
				return errorResult((error as Error).message);
			}
		},
	);
}
