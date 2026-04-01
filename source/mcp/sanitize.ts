import {type EmailAccount} from '../types/email.js';

export type SanitizedAccount = {
	id: string;
	email: string;
	displayName: string;
	provider: 'gmail' | 'outlook' | 'imap';
	authType: 'oauth2' | 'password';
	imapConfig?: {host: string; port: number; secure: boolean};
	smtpConfig?: {host: string; port: number; secure: boolean};
};

export function sanitizeAccount(account: EmailAccount): SanitizedAccount {
	return {
		id: account.id,
		email: account.email,
		displayName: account.displayName,
		provider: account.provider,
		authType: account.authType,
		...(account.imapConfig && {
			imapConfig: {
				host: account.imapConfig.host,
				port: account.imapConfig.port,
				secure: account.imapConfig.secure,
			},
		}),
		...(account.smtpConfig && {
			smtpConfig: {
				host: account.smtpConfig.host,
				port: account.smtpConfig.port,
				secure: account.smtpConfig.secure,
			},
		}),
	};
}
