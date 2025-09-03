export interface EmailAccount {
	id: string;
	email: string;
	displayName: string;
	provider: 'gmail' | 'outlook' | 'imap';
	authType: 'oauth2' | 'password';
	imapConfig?: ImapConfig;
	smtpConfig?: SmtpConfig;
	oauth2Config?: OAuth2Config;
}

export interface ImapConfig {
	host: string;
	port: number;
	secure: boolean;
	username?: string;
	password?: string;
}

export interface SmtpConfig {
	host: string;
	port: number;
	secure: boolean;
	username?: string;
	password?: string;
}

export interface OAuth2Config {
	provider: 'google' | 'microsoft';
	clientId: string;
	clientSecret?: string;
	refreshToken?: string;
	accessToken?: string;
	tokenExpiry?: Date;
}

export interface EmailMessage {
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
}

export interface EmailAddress {
	name?: string;
	address: string;
}

export interface Attachment {
	filename: string;
	contentType: string;
	size: number;
	contentId?: string;
	content?: Buffer;
}

export interface EmailFolder {
	name: string;
	displayName: string;
	specialUse?: string;
	delimiter: string;
	children?: EmailFolder[];
}
