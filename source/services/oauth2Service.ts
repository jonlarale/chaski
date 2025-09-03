import {OAuth2Client} from 'google-auth-library';
import {ConfidentialClientApplication} from '@azure/msal-node';
import {OAuth2Config} from '../types/email.js';

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
			'http://localhost:3000/oauth2/callback',
		);

		const authUrl = this.googleClient.generateAuthUrl({
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
		tenantId: string = 'common',
	): Promise<string> {
		const config = {
			auth: {
				clientId,
				authority: `https://login.microsoftonline.com/${tenantId}`,
				clientSecret: process.env['OUTLOOK_CLIENT_SECRET'] || '',
			},
		};

		this.msalClient = new ConfidentialClientApplication(config);

		const authCodeUrlParameters = {
			scopes: [
				'https://outlook.office.com/IMAP.AccessAsUser.All',
				'https://outlook.office.com/SMTP.Send',
				'offline_access',
			],
			redirectUri: 'http://localhost:3000/oauth2/callback',
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
				'http://localhost:3000/oauth2/callback',
			);
		}

		const {tokens} = await this.googleClient.getToken(code);

		return {
			provider: 'google',
			clientId,
			clientSecret,
			accessToken: tokens.access_token || '',
			refreshToken: tokens.refresh_token || '',
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
			redirectUri: 'http://localhost:3000/oauth2/callback',
		};

		const response = await this.msalClient.acquireTokenByCode(tokenRequest);

		return {
			provider: 'microsoft',
			clientId,
			clientSecret,
			accessToken: response.accessToken,
			refreshToken: '',
			tokenExpiry: response.expiresOn || undefined,
		};
	}

	async refreshGoogleToken(oauth2Config: OAuth2Config): Promise<string> {
		const client = new OAuth2Client(
			oauth2Config.clientId,
			oauth2Config.clientSecret,
		);

		client.setCredentials({
			refresh_token: oauth2Config.refreshToken,
		});

		const {credentials} = await client.refreshAccessToken();
		return credentials.access_token || '';
	}

	async refreshMicrosoftToken(oauth2Config: OAuth2Config): Promise<string> {
		const config = {
			auth: {
				clientId: oauth2Config.clientId,
				authority: 'https://login.microsoftonline.com/common',
				clientSecret: oauth2Config.clientSecret || '',
			},
		};

		const client = new ConfidentialClientApplication(config);

		const refreshTokenRequest = {
			refreshToken: oauth2Config.refreshToken || '',
			scopes: [
				'https://outlook.office.com/IMAP.AccessAsUser.All',
				'https://outlook.office.com/SMTP.Send',
			],
		};

		const response = await client.acquireTokenByRefreshToken(
			refreshTokenRequest,
		);
		return response?.accessToken || '';
	}
}
