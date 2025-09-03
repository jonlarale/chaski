import {EmailAccount, EmailMessage, EmailFolder} from '../types/email.js';
import {AccountStorageService} from './accountStorageService.js';
import {ImapService} from './imapService.js';
import {SmtpService, SendMailOptions} from './smtpService.js';
import {OAuth2Service} from './oauth2Service.js';

export class EmailService {
	private accountStorage = new AccountStorageService();
	private oauth2Service = new OAuth2Service();
	private imapServices = new Map<string, ImapService>();
	private smtpServices = new Map<string, SmtpService>();

	async getAccounts(): Promise<EmailAccount[]> {
		return this.accountStorage.getAllAccounts();
	}

	async getAccount(accountId: string): Promise<EmailAccount | null> {
		return this.accountStorage.getAccount(accountId);
	}

	async saveAccount(account: EmailAccount): Promise<void> {
		return this.accountStorage.saveAccount(account);
	}

	async deleteAccount(accountId: string): Promise<void> {
		// Disconnect services if connected
		const imap = this.imapServices.get(accountId);
		if (imap) {
			await imap.disconnect();
			this.imapServices.delete(accountId);
		}

		const smtp = this.smtpServices.get(accountId);
		if (smtp) {
			await smtp.disconnect();
			this.smtpServices.delete(accountId);
		}

		return this.accountStorage.deleteAccount(accountId);
	}

	async getGoogleAuthUrl(
		clientId: string,
		clientSecret: string,
	): Promise<string> {
		return this.oauth2Service.getGoogleAuthUrl(clientId, clientSecret);
	}

	async getMicrosoftAuthUrl(clientId: string): Promise<string> {
		return this.oauth2Service.getMicrosoftAuthUrl(clientId);
	}

	async handleGoogleOAuth2Callback(
		code: string,
		clientId: string,
		clientSecret: string,
	): Promise<EmailAccount> {
		const oauth2Config = await this.oauth2Service.getGoogleTokens(
			code,
			clientId,
			clientSecret,
		);

		// Create a basic account - user will need to provide email address
		const account: EmailAccount = {
			id: `gmail-${Date.now()}`,
			email: '', // Will be filled by user
			displayName: '',
			provider: 'gmail',
			authType: 'oauth2',
			oauth2Config,
			imapConfig: {
				host: 'imap.gmail.com',
				port: 993,
				secure: true,
			},
			smtpConfig: {
				host: 'smtp.gmail.com',
				port: 587,
				secure: false,
			},
		};

		return account;
	}

	async handleMicrosoftOAuth2Callback(
		code: string,
		clientId: string,
		clientSecret: string,
	): Promise<EmailAccount> {
		const oauth2Config = await this.oauth2Service.getMicrosoftTokens(
			code,
			clientId,
			clientSecret,
		);

		// Create a basic account - user will need to provide email address
		const account: EmailAccount = {
			id: `outlook-${Date.now()}`,
			email: '', // Will be filled by user
			displayName: '',
			provider: 'outlook',
			authType: 'oauth2',
			oauth2Config,
			imapConfig: {
				host: 'outlook.office365.com',
				port: 993,
				secure: true,
			},
			smtpConfig: {
				host: 'smtp.office365.com',
				port: 587,
				secure: false,
			},
		};

		return account;
	}

	async getFolders(accountId: string): Promise<EmailFolder[]> {
		const imap = await this.getImapService(accountId);
		return imap.getFolders();
	}

	async getMessages(
		accountId: string,
		folder: string,
		limit?: number,
		sequenceRange?: string,
	): Promise<EmailMessage[]> {
		const imap = await this.getImapService(accountId);
		const messages = await imap.getMessages(folder, limit, sequenceRange);

		// Set accountId and folder on messages
		return messages.map(msg => ({
			...msg,
			accountId,
			folder,
		}));
	}

	async getMessage(
		accountId: string,
		folder: string,
		uid: number,
	): Promise<EmailMessage | null> {
		const imap = await this.getImapService(accountId);
		const message = await imap.getMessage(folder, uid);

		if (message) {
			message.accountId = accountId;
			message.folder = folder;
		}

		return message;
	}

	async getThreadMessages(
		accountId: string,
		folder: string,
		messageId: string,
		references: string[],
	): Promise<EmailMessage[]> {
		const imap = await this.getImapService(accountId);
		const messages = await imap.getThreadMessages(
			folder,
			messageId,
			references,
		);

		// Set accountId for all messages
		return messages.map(message => ({
			...message,
			accountId,
			folder,
		}));
	}

	async markAsRead(
		accountId: string,
		folder: string,
		uid: number,
	): Promise<void> {
		const imap = await this.getImapService(accountId);
		return imap.markAsRead(folder, uid);
	}

	async deleteMessage(
		accountId: string,
		folder: string,
		uid: number,
	): Promise<void> {
		const imap = await this.getImapService(accountId);
		return imap.deleteMessage(folder, uid);
	}

	async getFolderStatus(
		accountId: string,
		folder: string,
	): Promise<{total: number; unseen: number}> {
		const imap = await this.getImapService(accountId);
		return imap.getFolderStatus(folder);
	}

	async sendMail(accountId: string, options: SendMailOptions): Promise<string> {
		const smtp = await this.getSmtpService(accountId);
		const account = await this.accountStorage.getAccount(accountId);

		if (!account) {
			throw new Error('Account not found');
		}

		// Set from address if not provided
		if (!options.from) {
			options.from = account.displayName
				? `"${account.displayName}" <${account.email}>`
				: account.email;
		}

		return smtp.sendMail(options);
	}

	private async getImapService(accountId: string): Promise<ImapService> {
		let imap = this.imapServices.get(accountId);

		if (!imap) {
			const account = await this.accountStorage.getAccount(accountId);
			if (!account) {
				throw new Error('Account not found');
			}

			imap = new ImapService();
			await imap.connect(account);
			this.imapServices.set(accountId, imap);
		}

		return imap;
	}

	private async getSmtpService(accountId: string): Promise<SmtpService> {
		let smtp = this.smtpServices.get(accountId);

		if (!smtp) {
			const account = await this.accountStorage.getAccount(accountId);
			if (!account) {
				throw new Error('Account not found');
			}

			smtp = new SmtpService();
			await smtp.connect(account);
			this.smtpServices.set(accountId, smtp);
		}

		return smtp;
	}

	async disconnectAll(): Promise<void> {
		const disconnectPromises: Promise<void>[] = [];

		for (const imap of this.imapServices.values()) {
			disconnectPromises.push(imap.disconnect());
		}

		for (const smtp of this.smtpServices.values()) {
			disconnectPromises.push(smtp.disconnect());
		}

		await Promise.all(disconnectPromises);

		this.imapServices.clear();
		this.smtpServices.clear();
	}
}
