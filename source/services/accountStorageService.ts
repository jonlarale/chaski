import {Buffer} from 'node:buffer';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import type {EmailAccount} from '../types/email.js';

const serviceName = 'chaski';
const configDir = join(homedir(), '.chaski');
const accountsFile = join(configDir, 'accounts.json');
const secretsFile = join(configDir, '.secrets');

export class AccountStorageService {
	private readonly encryptionKey: string;
	// eslint-disable-next-line @typescript-eslint/class-literal-property-style
	private readonly keytar: any = null;
	private useKeytar = false;
	private keytarInitialized = false;

	constructor() {
		if (!existsSync(configDir)) {
			mkdirSync(configDir, {recursive: true});
		}

		// Generate a simple encryption key based on the machine
		this.encryptionKey = createHash('sha256')
			.update(homedir() + serviceName)
			.digest('hex')
			.slice(0, 32);
	}

	async saveAccount(account: EmailAccount): Promise<void> {
		const accounts = await this.getAllAccounts();

		// Store sensitive data securely
		if (account.imapConfig?.password) {
			await this.setPassword(
				serviceName,
				`${account.id}-imap-password`,
				account.imapConfig.password,
			);
			account.imapConfig.password = undefined;
		}

		if (account.smtpConfig?.password) {
			await this.setPassword(
				serviceName,
				`${account.id}-smtp-password`,
				account.smtpConfig.password,
			);
			account.smtpConfig.password = undefined;
		}

		if (account.oauth2Config?.refreshToken) {
			await this.setPassword(
				serviceName,
				`${account.id}-refresh-token`,
				account.oauth2Config.refreshToken,
			);
		}

		if (account.oauth2Config?.accessToken) {
			await this.setPassword(
				serviceName,
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

		writeFileSync(accountsFile, JSON.stringify(accounts, null, 2));
	}

	async getAccount(accountId: string): Promise<EmailAccount | undefined> {
		const accounts = await this.getAllAccounts();
		const account = accounts.find(a => a.id === accountId);

		if (!account) {
			return undefined;
		}

		// Retrieve sensitive data
		if (account.imapConfig) {
			const imapPassword = await this.getPassword(
				serviceName,
				`${account.id}-imap-password`,
			);
			if (imapPassword) {
				account.imapConfig.password = imapPassword;
			}
		}

		if (account.smtpConfig) {
			const smtpPassword = await this.getPassword(
				serviceName,
				`${account.id}-smtp-password`,
			);
			if (smtpPassword) {
				account.smtpConfig.password = smtpPassword;
			}
		}

		if (account.oauth2Config) {
			const refreshToken = await this.getPassword(
				serviceName,
				`${account.id}-refresh-token`,
			);
			const accessToken = await this.getPassword(
				serviceName,
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
		if (!existsSync(accountsFile)) {
			return [];
		}

		try {
			const data = readFileSync(accountsFile, 'utf8');

			return JSON.parse(data) as EmailAccount[];
		} catch {
			return [];
		}
	}

	async deleteAccount(accountId: string): Promise<void> {
		const accounts = await this.getAllAccounts();
		const filteredAccounts = accounts.filter(a => a.id !== accountId);

		// Delete sensitive data
		await this.deletePassword(serviceName, `${accountId}-imap-password`);
		await this.deletePassword(serviceName, `${accountId}-smtp-password`);
		await this.deletePassword(serviceName, `${accountId}-refresh-token`);
		await this.deletePassword(serviceName, `${accountId}-access-token`);

		writeFileSync(accountsFile, JSON.stringify(filteredAccounts, null, 2));
	}

	async updateTokens(
		accountId: string,
		accessToken: string,
		refreshToken?: string,
		tokenExpiry?: Date,
	): Promise<void> {
		const account = await this.getAccount(accountId);
		if (!account?.oauth2Config) {
			throw new Error('Account not found or not OAuth2 enabled');
		}

		await this.setPassword(
			serviceName,
			`${accountId}-access-token`,
			accessToken,
		);

		if (refreshToken) {
			await this.setPassword(
				serviceName,
				`${accountId}-refresh-token`,
				refreshToken,
			);
		}

		account.oauth2Config.tokenExpiry =
			tokenExpiry ?? new Date(Date.now() + 3600 * 1000);
		await this.saveAccount(account);
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
		} catch {
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
			encrypted += String.fromCodePoint(
				// eslint-disable-next-line no-bitwise
				text.codePointAt(i)! ^
					this.encryptionKey.codePointAt(i % this.encryptionKey.length)!,
			);
		}

		return Buffer.from(encrypted).toString('base64');
	}

	private decrypt(encrypted: string): string {
		const text = Buffer.from(encrypted, 'base64').toString();
		let decrypted = '';

		for (let i = 0; i < text.length; i++) {
			decrypted += String.fromCodePoint(
				// eslint-disable-next-line no-bitwise
				text.codePointAt(i)! ^
					this.encryptionKey.codePointAt(i % this.encryptionKey.length)!,
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
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call
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
	): Promise<string | undefined> {
		await this.initKeytar();

		if (this.useKeytar && this.keytar) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
			return this.keytar.getPassword(service, account);
		}

		const secrets = this.loadSecrets();
		const key = `${service}:${account}`;

		if (secrets[key]) {
			return this.decrypt(secrets[key]);
		}

		return undefined;
	}

	private async deletePassword(
		service: string,
		account: string,
	): Promise<boolean> {
		await this.initKeytar();

		if (this.useKeytar && this.keytar) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
			return this.keytar.deletePassword(service, account);
		}

		const secrets = this.loadSecrets();
		const key = `${service}:${account}`;

		if (secrets[key]) {
			// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
			delete secrets[key];
			this.saveSecrets(secrets);

			return true;
		}

		return false;
	}

	private loadSecrets(): Record<string, string> {
		if (!existsSync(secretsFile)) {
			return {};
		}

		try {
			const data = readFileSync(secretsFile, 'utf8');

			return JSON.parse(data) as Record<string, string>;
		} catch {
			return {};
		}
	}

	private saveSecrets(secrets: Record<string, string>): void {
		writeFileSync(secretsFile, JSON.stringify(secrets, null, 2), {
			mode: 0o600,
		});
	}
}
