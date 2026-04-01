import {z} from 'zod';

export const accountIdSchema = {
	accountId: z.string().describe('The account ID'),
};

export const folderRefSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z
		.string()
		.describe('The folder name (e.g. "INBOX", "Sent", "[Gmail]/All Mail")'),
};

export const messageRefSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z.string().describe('The folder name'),
	uid: z.number().describe('The message UID'),
};

export const listMessagesSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z.string().describe('The folder name').default('INBOX'),
	limit: z
		.number()
		.min(1)
		.max(100)
		.default(20)
		.describe('Max messages to return'),
	offset: z.number().min(0).default(0).describe('Offset for pagination'),
};

export const sendMailSchema = {
	accountId: z.string().describe('The account ID to send from'),
	to: z.string().describe('Recipient email address(es), comma-separated'),
	subject: z.string().describe('Email subject'),
	text: z.string().describe('Plain text body of the email'),
	cc: z.string().optional().describe('CC recipients, comma-separated'),
	bcc: z.string().optional().describe('BCC recipients, comma-separated'),
	html: z
		.string()
		.optional()
		.describe('HTML body (optional, overrides text for HTML clients)'),
	inReplyTo: z.string().optional().describe('Message-ID to reply to'),
	references: z
		.string()
		.optional()
		.describe('Space-separated Message-IDs for threading'),
};

export const searchMessagesSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z.string().describe('The folder to search in').default('INBOX'),
	query: z.string().describe('Search term to match against subject or sender'),
	limit: z.number().min(1).max(100).default(20).describe('Max results'),
};

export const assistantQuerySchema = {
	prompt: z.string().describe('Question about the emails'),
	accountId: z.string().optional().describe('Limit context to this account'),
	folder: z
		.string()
		.optional()
		.describe('Limit context to this folder')
		.default('INBOX'),
};

export const downloadAttachmentSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z.string().describe('The folder name'),
	uid: z.number().describe('The message UID'),
	attachmentIndex: z
		.number()
		.min(0)
		.describe('Zero-based index of the attachment'),
};

export const addAccountSchema = {
	email: z.string().describe('Email address'),
	provider: z
		.enum(['gmail', 'outlook', 'imap'])
		.describe('Email provider (gmail for Google Workspace too)'),
	password: z.string().describe('Email password or app password'),
	imapHost: z
		.string()
		.optional()
		.describe(
			'IMAP server host (auto-detected for gmail/outlook, required for imap)',
		),
	imapPort: z.number().optional().default(993).describe('IMAP port'),
	smtpHost: z
		.string()
		.optional()
		.describe(
			'SMTP server host (auto-detected for gmail/outlook, required for imap)',
		),
	smtpPort: z.number().optional().default(587).describe('SMTP port'),
	displayName: z
		.string()
		.optional()
		.describe('Display name (defaults to email)'),
};

export const removeAccountSchema = {
	accountId: z.string().describe('The account ID to remove'),
};

export const refreshFolderSchema = {
	accountId: z.string().describe('The account ID'),
	folder: z
		.string()
		.describe('The folder to refresh from IMAP')
		.default('INBOX'),
	limit: z
		.number()
		.min(1)
		.max(500)
		.default(200)
		.describe('Max messages to fetch'),
};
