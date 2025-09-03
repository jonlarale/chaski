import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {EmailAccount} from '../types/email.js';

const SERVICE_NAME = 'chaski';
const CONFIG_DIR = join(homedir(), '.chaski');
const ACCOUNTS_FILE = join(CONFIG_DIR, 'accounts.json');
const SECRETS_FILE = join(CONFIG_DIR, '.secrets');

export class AccountStorageService {
	private encryptionKey: string;
	private keytar: any = null;
	private useKeytar = false;
	private keytarInitialized = false;

	constructor() {
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, {recursive: true});
		}

		// Generate a simple encryption key based on the machine
		this.encryptionKey = createHash('sha256')
			.update(homedir() + SERVICE_NAME)
			.digest('hex')
			.substring(0, 32);
	}

	private async initKeytar(): Promise<void> {
		if (this.keytarInitialized) return;

		try {
			// Temporarily disable keytar due to environment issues
			// const keytarModule = await import('keytar');
			// this.keytar = keytarModule.default || keytarModule;
			// await this.keytar.getPassword('test-service', 'test-account');
			// this.useKeytar = true;
			// console.log('Using secure keychain storage for passwords');
			throw new Error('Keytar disabled for now');
		} catch (error) {
			console.log('Using encrypted file storage for passwords');
			this.useKeytar = false;
		}

		this.keytarInitialized = true;
	}

	private encrypt(text: string): string {
		// Simple XOR encryption - NOT SECURE for production
		// This is just to prevent passwords from being stored in plain text
		let encrypted = '';
		for (let i = 0; i < text.length; i++) {
			encrypted += String.fromCharCode(
				text.charCodeAt(i) ^
					this.encryptionKey.charCodeAt(i % this.encryptionKey.length),
			);
		}
		return Buffer.from(encrypted).toString('base64');
	}

	private decrypt(encrypted: string): string {
		const text = Buffer.from(encrypted, 'base64').toString();
		let decrypted = '';
		for (let i = 0; i < text.length; i++) {
			decrypted += String.fromCharCode(
				text.charCodeAt(i) ^
					this.encryptionKey.charCodeAt(i % this.encryptionKey.length),
			);
		}
		return decrypted;
	}

	private async setPassword(
		service: string,
		account: string,
		password: string,
	): Promise<void> {
		await this.initKeytar();

		if (this.useKeytar && this.keytar) {
			await this.keytar.setPassword(service, account, password);
		} else {
			// Fall back to encrypted file storage
			const secrets = this.loadSecrets();
			secrets[`${service}:${account}`] = this.encrypt(password);
			this.saveSecrets(secrets);
		}
	}

	private async getPassword(
		service: string,
		account: string,
	): Promise<string | null> {
		await this.initKeytar();

		if (this.useKeytar && this.keytar) {
			return await this.keytar.getPassword(service, account);
		} else {
			const secrets = this.loadSecrets();
			const key = `${service}:${account}`;
			if (secrets[key]) {
				return this.decrypt(secrets[key]);
			}
			return null;
		}
	}

	private async deletePassword(
		service: string,
		account: string,
	): Promise<boolean> {
		await this.initKeytar();

		if (this.useKeytar && this.keytar) {
			return await this.keytar.deletePassword(service, account);
		} else {
			const secrets = this.loadSecrets();
			const key = `${service}:${account}`;
			if (secrets[key]) {
				delete secrets[key];
				this.saveSecrets(secrets);
				return true;
			}
			return false;
		}
	}

	private loadSecrets(): Record<string, string> {
		if (!existsSync(SECRETS_FILE)) {
			return {};
		}
		try {
			const data = readFileSync(SECRETS_FILE, 'utf8');
			return JSON.parse(data);
		} catch {
			return {};
		}
	}

	private saveSecrets(secrets: Record<string, string>): void {
		writeFileSync(SECRETS_FILE, JSON.stringify(secrets, null, 2), {
			mode: 0o600,
		});
	}

	async saveAccount(account: EmailAccount): Promise<void> {
		const accounts = await this.getAllAccounts();

		// Store sensitive data securely
		if (account.imapConfig?.password) {
			await this.setPassword(
				SERVICE_NAME,
				`${account.id}-imap-password`,
				account.imapConfig.password,
			);
			account.imapConfig.password = undefined;
		}

		if (account.smtpConfig?.password) {
			await this.setPassword(
				SERVICE_NAME,
				`${account.id}-smtp-password`,
				account.smtpConfig.password,
			);
			account.smtpConfig.password = undefined;
		}

		if (account.oauth2Config?.refreshToken) {
			await this.setPassword(
				SERVICE_NAME,
				`${account.id}-refresh-token`,
				account.oauth2Config.refreshToken,
			);
		}

		if (account.oauth2Config?.accessToken) {
			await this.setPassword(
				SERVICE_NAME,
				`${account.id}-access-token`,
				account.oauth2Config.accessToken,
			);
		}

		// Update or add account
		const existingIndex = accounts.findIndex(a => a.id === account.id);
		if (existingIndex >= 0) {
			accounts[existingIndex] = account;
		} else {
			accounts.push(account);
		}

		writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2));
	}

	async getAccount(accountId: string): Promise<EmailAccount | null> {
		const accounts = await this.getAllAccounts();
		const account = accounts.find(a => a.id === accountId);

		if (!account) {
			return null;
		}

		// Retrieve sensitive data
		if (account.imapConfig) {
			const imapPassword = await this.getPassword(
				SERVICE_NAME,
				`${account.id}-imap-password`,
			);
			if (imapPassword) {
				account.imapConfig.password = imapPassword;
			}
		}

		if (account.smtpConfig) {
			const smtpPassword = await this.getPassword(
				SERVICE_NAME,
				`${account.id}-smtp-password`,
			);
			if (smtpPassword) {
				account.smtpConfig.password = smtpPassword;
			}
		}

		if (account.oauth2Config) {
			const refreshToken = await this.getPassword(
				SERVICE_NAME,
				`${account.id}-refresh-token`,
			);
			const accessToken = await this.getPassword(
				SERVICE_NAME,
				`${account.id}-access-token`,
			);

			if (refreshToken) {
				account.oauth2Config.refreshToken = refreshToken;
			}
			if (accessToken) {
				account.oauth2Config.accessToken = accessToken;
			}
		}

		return account;
	}

	async getAllAccounts(): Promise<EmailAccount[]> {
		if (!existsSync(ACCOUNTS_FILE)) {
			return [];
		}

		try {
			const data = readFileSync(ACCOUNTS_FILE, 'utf8');
			return JSON.parse(data) as EmailAccount[];
		} catch {
			return [];
		}
	}

	async deleteAccount(accountId: string): Promise<void> {
		const accounts = await this.getAllAccounts();
		const filteredAccounts = accounts.filter(a => a.id !== accountId);

		// Delete sensitive data
		await this.deletePassword(SERVICE_NAME, `${accountId}-imap-password`);
		await this.deletePassword(SERVICE_NAME, `${accountId}-smtp-password`);
		await this.deletePassword(SERVICE_NAME, `${accountId}-refresh-token`);
		await this.deletePassword(SERVICE_NAME, `${accountId}-access-token`);

		writeFileSync(ACCOUNTS_FILE, JSON.stringify(filteredAccounts, null, 2));
	}

	async updateTokens(
		accountId: string,
		accessToken: string,
		refreshToken?: string,
	): Promise<void> {
		const account = await this.getAccount(accountId);
		if (!account || !account.oauth2Config) {
			throw new Error('Account not found or not OAuth2 enabled');
		}

		await this.setPassword(
			SERVICE_NAME,
			`${accountId}-access-token`,
			accessToken,
		);

		if (refreshToken) {
			await this.setPassword(
				SERVICE_NAME,
				`${accountId}-refresh-token`,
				refreshToken,
			);
		}

		account.oauth2Config.tokenExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour
		await this.saveAccount(account);
	}
}
