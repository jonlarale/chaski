import type {Buffer} from 'node:buffer';

// eslint-disable-next-line @typescript-eslint/naming-convention
export type OAuth2Config = {
	provider: 'google' | 'microsoft';
	clientId: string;
	clientSecret?: string;
	refreshToken?: string;
	accessToken?: string;
	tokenExpiry?: Date;
};

export type EmailAccount = {
	id: string;
	email: string;
	displayName: string;
	provider: 'gmail' | 'outlook' | 'imap';
	authType: 'oauth2' | 'password';
	imapConfig?: ImapConfig;
	smtpConfig?: SmtpConfig;
	oauth2Config?: OAuth2Config;
};

export type ImapConfig = {
	host: string;
	port: number;
	secure: boolean;
	username?: string;
	password?: string;
};

export type SmtpConfig = {
	host: string;
	port: number;
	secure: boolean;
	username?: string;
	password?: string;
};

export type EmailMessage = {
	id: string;
	accountId: string;
	folder: string;
	uid?: number;
	messageId: string;
	from: EmailAddress[];
	to: EmailAddress[];
	cc?: EmailAddress[];
	bcc?: EmailAddress[];
	subject: string;
	date: Date;
	body: {
		text?: string;
		html?: string;
	};
	attachments?: Attachment[];
	flags: string[];
	labels?: string[];
	threadId?: string;
	inReplyTo?: string;
	references?: string[];
};

export type EmailAddress = {
	name?: string;
	address: string;
};

export type Attachment = {
	filename: string;
	contentType: string;
	size: number;
	contentId?: string;
	content?: Buffer;
};

export type EmailFolder = {
	name: string;
	displayName: string;
	specialUse?: string;
	delimiter: string;
	children?: EmailFolder[];
};
