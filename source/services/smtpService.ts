import nodemailer from 'nodemailer';
import {EmailAccount} from '../types/email.js';
import {OAuth2Service} from './oauth2Service.js';
import {AccountStorageService} from './accountStorageService.js';

export interface SendMailOptions {
	from?: string;
	to: string | string[];
	cc?: string | string[];
	bcc?: string | string[];
	subject: string;
	text?: string;
	html?: string;
	attachments?: Array<{
		filename: string;
		content?: Buffer | string;
		path?: string;
		contentType?: string;
	}>;
	inReplyTo?: string;
	references?: string | string[];
}

export class SmtpService {
	private transporter: nodemailer.Transporter | null = null;
	private oauth2Service = new OAuth2Service();
	private accountStorage = new AccountStorageService();

	async connect(account: EmailAccount): Promise<void> {
		let transportOptions: any;

		if (account.authType === 'oauth2' && account.oauth2Config) {
			// Get fresh access token
			let accessToken = account.oauth2Config.accessToken || '';

			// Check if token needs refresh
			if (
				account.oauth2Config.tokenExpiry &&
				new Date() >= account.oauth2Config.tokenExpiry
			) {
				if (account.oauth2Config.provider === 'google') {
					accessToken = await this.oauth2Service.refreshGoogleToken(
						account.oauth2Config,
					);
				} else {
					accessToken = await this.oauth2Service.refreshMicrosoftToken(
						account.oauth2Config,
					);
				}

				await this.accountStorage.updateTokens(account.id, accessToken);
			}

			const service = account.provider === 'gmail' ? 'gmail' : undefined;
			const host =
				account.smtpConfig?.host ||
				(account.provider === 'gmail'
					? 'smtp.gmail.com'
					: 'smtp.office365.com');
			const port = account.smtpConfig?.port || 587;

			transportOptions = {
				service,
				host,
				port,
				secure: port === 465,
				auth: {
					type: 'OAuth2',
					user: account.email,
					clientId: account.oauth2Config.clientId,
					clientSecret: account.oauth2Config.clientSecret,
					refreshToken: account.oauth2Config.refreshToken,
					accessToken,
				},
			};
		} else if (account.smtpConfig) {
			transportOptions = {
				host: account.smtpConfig.host,
				port: account.smtpConfig.port,
				secure: account.smtpConfig.secure,
				auth: {
					user: account.smtpConfig.username || account.email,
					pass: account.smtpConfig.password || '',
				},
			};
		} else {
			throw new Error('No SMTP configuration found');
		}

		this.transporter = nodemailer.createTransport(transportOptions);

		// Verify connection
		await this.transporter.verify();
	}

	async sendMail(options: SendMailOptions): Promise<string> {
		if (!this.transporter) {
			throw new Error('Not connected to SMTP server');
		}

		const mailOptions: nodemailer.SendMailOptions = {
			from: options.from,
			to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
			cc: options.cc
				? Array.isArray(options.cc)
					? options.cc.join(', ')
					: options.cc
				: undefined,
			bcc: options.bcc
				? Array.isArray(options.bcc)
					? options.bcc.join(', ')
					: options.bcc
				: undefined,
			subject: options.subject,
			text: options.text,
			html: options.html,
			attachments: options.attachments,
			inReplyTo: options.inReplyTo,
			references: options.references
				? Array.isArray(options.references)
					? options.references.join(' ')
					: options.references
				: undefined,
		};

		const info = await this.transporter.sendMail(mailOptions);
		return info.messageId;
	}

	async disconnect(): Promise<void> {
		if (this.transporter) {
			this.transporter.close();
			this.transporter = null;
		}
	}
}
