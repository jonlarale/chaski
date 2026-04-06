import process from 'node:process';
import {OAuth2Client} from 'google-auth-library';
import {ConfidentialClientApplication} from '@azure/msal-node';
import type {OAuth2Config} from '../types/email.js';

export type RefreshResult = {
	accessToken: string;
	refreshToken?: string;
	tokenExpiry?: Date;
};

function getRedirectUri(): string {
	const port = process.env['OAUTH_CALLBACK_PORT'] ?? '3000';
	const path = process.env['OAUTH_CALLBACK_PATH'] ?? '/oauth2/callback';
	return process.env['OAUTH_REDIRECT_URI'] ?? `http://localhost:${port}${path}`;
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export class OAuth2Service {
	private googleClient?: OAuth2Client;
	private msalClient?: ConfidentialClientApplication;

	async getGoogleAuthUrl(
		clientId: string,
		clientSecret: string,
	): Promise<string> {
		this.googleClient = new OAuth2Client(
			clientId,
			clientSecret,
			getRedirectUri(),
		);

		const authUrl = this.googleClient.generateAuthUrl({
			// eslint-disable-next-line @typescript-eslint/naming-convention
			access_type: 'offline',
			scope: [
				'https://www.googleapis.com/auth/gmail.readonly',
				'https://www.googleapis.com/auth/gmail.send',
				'https://www.googleapis.com/auth/gmail.modify',
				'https://mail.google.com/',
			],
			prompt: 'consent',
		});

		return authUrl;
	}

	async getMicrosoftAuthUrl(
		clientId: string,
		tenantId = 'common',
	): Promise<string> {
		const config = {
			auth: {
				clientId,
				authority: `https://login.microsoftonline.com/${tenantId}`,
				clientSecret: process.env['OUTLOOK_CLIENT_SECRET'] ?? '',
			},
		};

		this.msalClient = new ConfidentialClientApplication(config);

		const authCodeUrlParameters = {
			scopes: [
				'https://outlook.office.com/IMAP.AccessAsUser.All',
				'https://outlook.office.com/SMTP.Send',
				'offline_access',
			],
			redirectUri: getRedirectUri(),
		};

		const authUrl = await this.msalClient.getAuthCodeUrl(authCodeUrlParameters);
		return authUrl;
	}

	async getGoogleTokens(
		code: string,
		clientId: string,
		clientSecret: string,
	): Promise<OAuth2Config> {
		if (!this.googleClient) {
			this.googleClient = new OAuth2Client(
				clientId,
				clientSecret,
				getRedirectUri(),
			);
		}

		const {tokens} = await this.googleClient.getToken(code);

		return {
			provider: 'google',
			clientId,
			clientSecret,
			accessToken: tokens.access_token ?? '',
			refreshToken: tokens.refresh_token ?? '',
			tokenExpiry: tokens.expiry_date
				? new Date(tokens.expiry_date)
				: undefined,
		};
	}

	async getMicrosoftTokens(
		code: string,
		clientId: string,
		clientSecret: string,
	): Promise<OAuth2Config> {
		if (!this.msalClient) {
			const config = {
				auth: {
					clientId,
					authority: 'https://login.microsoftonline.com/common',
					clientSecret,
				},
			};
			this.msalClient = new ConfidentialClientApplication(config);
		}

		const tokenRequest = {
			code,
			scopes: [
				'https://outlook.office.com/IMAP.AccessAsUser.All',
				'https://outlook.office.com/SMTP.Send',
				'offline_access',
			],
			redirectUri: getRedirectUri(),
		};

		const response = await this.msalClient.acquireTokenByCode(tokenRequest);

		// Extract refresh token from MSAL's internal cache
		let refreshToken = '';
		try {
			const cache = this.msalClient.getTokenCache().serialize();
			const cacheData = JSON.parse(cache) as Record<
				string,
				Record<string, Record<string, string>>
			>;
			const refreshTokens = cacheData['RefreshToken'];
			if (refreshTokens) {
				const firstKey = Object.keys(refreshTokens)[0];
				if (firstKey) {
					refreshToken = refreshTokens[firstKey]!['secret'] ?? '';
				}
			}
		} catch {
			// If cache extraction fails, continue without refresh token
		}

		return {
			provider: 'microsoft',
			clientId,
			clientSecret,
			accessToken: response.accessToken,
			refreshToken,
			tokenExpiry: response.expiresOn ?? undefined,
		};
	}

	async refreshGoogleToken(oauth2Config: OAuth2Config): Promise<RefreshResult> {
		const client = new OAuth2Client(
			oauth2Config.clientId,
			oauth2Config.clientSecret,
		);

		client.setCredentials({
			// eslint-disable-next-line @typescript-eslint/naming-convention
			refresh_token: oauth2Config.refreshToken,
		});

		const {credentials} = await client.refreshAccessToken();
		return {
			accessToken: credentials.access_token ?? '',
			refreshToken: credentials.refresh_token ?? undefined,
			tokenExpiry: credentials.expiry_date
				? new Date(credentials.expiry_date)
				: undefined,
		};
	}

	async refreshMicrosoftToken(
		oauth2Config: OAuth2Config,
	): Promise<RefreshResult> {
		const config = {
			auth: {
				clientId: oauth2Config.clientId,
				authority: 'https://login.microsoftonline.com/common',
				clientSecret: oauth2Config.clientSecret ?? '',
			},
		};

		const client = new ConfidentialClientApplication(config);

		const refreshTokenRequest = {
			refreshToken: oauth2Config.refreshToken ?? '',
			scopes: [
				'https://outlook.office.com/IMAP.AccessAsUser.All',
				'https://outlook.office.com/SMTP.Send',
			],
		};

		const response = await client.acquireTokenByRefreshToken(
			refreshTokenRequest,
		);

		// Extract updated refresh token from MSAL cache
		let refreshToken: string | undefined;
		try {
			const cache = client.getTokenCache().serialize();
			const cacheData = JSON.parse(cache) as Record<
				string,
				Record<string, Record<string, string>>
			>;
			const refreshTokens = cacheData['RefreshToken'];
			if (refreshTokens) {
				const firstKey = Object.keys(refreshTokens)[0];
				if (firstKey) {
					refreshToken = refreshTokens[firstKey]!['secret'];
				}
			}
		} catch {
			// If cache extraction fails, continue without new refresh token
		}

		return {
			accessToken: response?.accessToken ?? '',
			refreshToken,
			tokenExpiry: response?.expiresOn ?? undefined,
		};
	}
}
