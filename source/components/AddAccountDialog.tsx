import process from 'node:process';
import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import open from 'open';
import type {EmailAccount} from '../types/email.js';
import type {EmailService} from '../services/emailService.js';
import {waitForOauthCallback} from '../services/oauthCallbackServer.js';

type AddAccountDialogProps = {
	readonly onComplete: (account: EmailAccount | undefined) => void;
	readonly emailService: EmailService;
};

type Step =
	| 'provider'
	| 'authType'
	| 'email'
	| 'password'
	| 'imap'
	| 'smtp'
	| 'oauth-waiting'
	| 'oauth-error';

function AddAccountDialog({onComplete, emailService}: AddAccountDialogProps) {
	const [step, setStep] = useState<Step>('provider');
	const [account, setAccount] = useState<Partial<EmailAccount>>({
		id: `account-${Date.now()}`,
		provider: 'gmail',
		authType: 'oauth2',
	});
	const [emailValue, setEmailValue] = useState('');
	const [passwordValue, setPasswordValue] = useState('');
	const [imapValue, setImapValue] = useState('');
	const [smtpValue, setSmtpValue] = useState('');
	const [oauthStatus, setOauthStatus] = useState('');
	const [oauthError, setOauthError] = useState('');

	useInput((_input, key) => {
		if (key.escape) {
			onComplete(undefined);
		}

		if (step === 'oauth-error' && key.return) {
			onComplete(undefined);
		}
	});

	const providerItems = [
		{label: 'Gmail / Google Workspace', value: 'gmail'},
		{label: 'Outlook/Office 365', value: 'outlook'},
		{label: 'Other (IMAP/SMTP)', value: 'imap'},
	];

	const authTypeItems = [
		{label: 'OAuth2 (Recommended)', value: 'oauth2'},
		{label: 'App Password', value: 'password'},
	];

	const handleProviderSelect = (item: {value: string}) => {
		const provider = item.value as 'gmail' | 'outlook' | 'imap';
		setAccount({...account, provider});

		if (provider === 'imap') {
			setAccount(previous => ({...previous, provider, authType: 'password'}));
			setStep('email');
		} else {
			setAccount(previous => ({...previous, provider}));
			setStep('authType');
		}
	};

	const handleAuthTypeSelect = (item: {value: string}) => {
		const authType = item.value as 'oauth2' | 'password';
		setAccount(previous => ({...previous, authType}));

		if (authType === 'oauth2') {
			setStep('email');
		} else {
			setStep('email');
		}
	};

	const startOauthFlow = async (
		email: string,
		provider: 'gmail' | 'outlook',
	) => {
		setStep('oauth-waiting');

		try {
			let authUrl: string;
			let clientId: string;
			let clientSecret: string;

			if (provider === 'gmail') {
				clientId = process.env['GMAIL_CLIENT_ID'] ?? '';
				clientSecret = process.env['GMAIL_CLIENT_SECRET'] ?? '';

				if (!clientId || !clientSecret) {
					setOauthError(
						'GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env file',
					);
					setStep('oauth-error');
					return;
				}

				setOauthStatus('Generating authorization URL...');
				authUrl = await emailService.getGoogleAuthUrl(clientId, clientSecret);
			} else {
				clientId = process.env['OUTLOOK_CLIENT_ID'] ?? '';
				clientSecret = process.env['OUTLOOK_CLIENT_SECRET'] ?? '';

				if (!clientId) {
					setOauthError('OUTLOOK_CLIENT_ID must be set in .env file');
					setStep('oauth-error');
					return;
				}

				setOauthStatus('Generating authorization URL...');
				authUrl = await emailService.getMicrosoftAuthUrl(clientId);
			}

			setOauthStatus('Opening browser for authorization...');
			await open(authUrl);

			setOauthStatus('Waiting for authorization in browser...');
			const code = await waitForOauthCallback();

			setOauthStatus('Exchanging authorization code for tokens...');

			let oauthAccount: EmailAccount;
			if (provider === 'gmail') {
				oauthAccount = await emailService.handleGoogleOauth2Callback(
					code,
					clientId,
					clientSecret,
				);
			} else {
				oauthAccount = await emailService.handleMicrosoftOauth2Callback(
					code,
					clientId,
					clientSecret,
				);
			}

			// Fill in user details
			oauthAccount.id = account.id ?? `account-${Date.now()}`;
			oauthAccount.email = email;
			oauthAccount.displayName = email;

			setOauthStatus('Authorization successful!');
			onComplete(oauthAccount);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			setOauthError(message);
			setStep('oauth-error');
		}
	};

	const handleEmailSubmit = (email: string) => {
		const sanitizedEmail = email.trim();

		if (!sanitizedEmail.includes('@')) {
			return;
		}

		setAccount(previous => ({
			...previous,
			email: sanitizedEmail,
			displayName: sanitizedEmail,
		}));

		if (
			account.authType === 'oauth2' &&
			(account.provider === 'gmail' || account.provider === 'outlook')
		) {
			void startOauthFlow(sanitizedEmail, account.provider);
		} else if (account.authType === 'password') {
			setStep('password');
		} else if (account.provider === 'imap') {
			setStep('imap');
		}
	};

	const handlePasswordSubmit = (password: string) => {
		const sanitizedPassword = password.trim();

		if (account.provider === 'gmail') {
			const completeAccount: EmailAccount = {
				...(account as EmailAccount),
				imapConfig: {
					host: 'imap.gmail.com',
					port: 993,
					secure: true,
					username: account.email,
					password: sanitizedPassword,
				},
				smtpConfig: {
					host: 'smtp.gmail.com',
					port: 587,
					secure: false,
					username: account.email,
					password: sanitizedPassword,
				},
			};
			setAccount(completeAccount);
			onComplete(completeAccount);
		} else if (account.provider === 'outlook') {
			const completeAccount: EmailAccount = {
				...(account as EmailAccount),
				imapConfig: {
					host: 'outlook.office365.com',
					port: 993,
					secure: true,
					username: account.email,
					password: sanitizedPassword,
				},
				smtpConfig: {
					host: 'smtp.office365.com',
					port: 587,
					secure: false,
					username: account.email,
					password: sanitizedPassword,
				},
			};
			setAccount(completeAccount);
			onComplete(completeAccount);
		} else {
			setStep('imap');
		}
	};

	const handleImapSubmit = (value: string) => {
		const sanitizedValue = value.trim();

		if (!account.imapConfig) {
			setAccount({
				...account,
				imapConfig: {
					host: sanitizedValue,
					port: 993,
					secure: true,
					username: account.email,
					password: '',
				},
			});
			setImapValue('');
			setPasswordValue('');
		} else if (!account.imapConfig.password) {
			setAccount({
				...account,
				imapConfig: {...account.imapConfig, password: sanitizedValue},
			});
			setStep('smtp');
		}
	};

	const handleSmtpSubmit = (value: string) => {
		const sanitizedValue = value.trim();

		if (!account.smtpConfig) {
			const completeAccount: EmailAccount = {
				...(account as EmailAccount),
				smtpConfig: {
					host: sanitizedValue,
					port: 587,
					secure: false,
					username: account.email,
					password: account.imapConfig?.password,
				},
			};
			setAccount(completeAccount);
			onComplete(completeAccount);
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="green">
				Add Email Account
			</Text>
			<Text dimColor>Press ESC to cancel</Text>
			<Box marginTop={1}>
				{step === 'provider' && (
					<Box flexDirection="column">
						<Text>Select your email provider:</Text>
						<Box marginTop={1}>
							<SelectInput
								items={providerItems}
								onSelect={handleProviderSelect}
							/>
						</Box>
					</Box>
				)}

				{step === 'authType' && (
					<Box flexDirection="column">
						<Text>Select authentication method:</Text>
						<Box marginTop={1}>
							<SelectInput
								items={authTypeItems}
								onSelect={handleAuthTypeSelect}
							/>
						</Box>
					</Box>
				)}

				{step === 'email' && (
					<Box flexDirection="column">
						<Text>Enter your email address:</Text>
						<Box marginTop={1}>
							<TextInput
								value={emailValue}
								placeholder="you@example.com"
								onChange={setEmailValue}
								onSubmit={handleEmailSubmit}
							/>
						</Box>
					</Box>
				)}

				{step === 'password' && (
					<Box flexDirection="column">
						<Text>Enter your password:</Text>
						{account.provider === 'gmail' && (
							<Text dimColor italic>
								Use an App Password (generate at myaccount.google.com)
							</Text>
						)}
						{account.provider === 'outlook' && (
							<Text dimColor italic>
								Use your account password
							</Text>
						)}
						<Box marginTop={1}>
							<TextInput
								value={passwordValue}
								placeholder="Password"
								mask="*"
								onChange={setPasswordValue}
								onSubmit={handlePasswordSubmit}
							/>
						</Box>
					</Box>
				)}

				{step === 'imap' && (
					<Box flexDirection="column">
						{account.imapConfig ? (
							<>
								<Text>Enter IMAP password:</Text>
								<Box marginTop={1}>
									<TextInput
										value={passwordValue}
										placeholder="Password"
										mask="*"
										onChange={setPasswordValue}
										onSubmit={handleImapSubmit}
									/>
								</Box>
							</>
						) : (
							<>
								<Text>Enter IMAP server:</Text>
								<Box marginTop={1}>
									<TextInput
										value={imapValue}
										placeholder="imap.example.com"
										onChange={setImapValue}
										onSubmit={handleImapSubmit}
									/>
								</Box>
							</>
						)}
					</Box>
				)}

				{step === 'smtp' && (
					<Box flexDirection="column">
						<Text>Enter SMTP server:</Text>
						<Box marginTop={1}>
							<TextInput
								value={smtpValue}
								placeholder="smtp.example.com"
								onChange={setSmtpValue}
								onSubmit={handleSmtpSubmit}
							/>
						</Box>
					</Box>
				)}

				{step === 'oauth-waiting' && (
					<Box flexDirection="column">
						<Text bold color="cyan">
							Google Authorization
						</Text>
						<Box marginTop={1}>
							<Text>{oauthStatus || 'Starting...'}</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Complete the authorization in your browser.</Text>
						</Box>
					</Box>
				)}

				{step === 'oauth-error' && (
					<Box flexDirection="column">
						<Text bold color="red">
							Authorization Failed
						</Text>
						<Box marginTop={1}>
							<Text color="red">{oauthError}</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Press Enter or ESC to go back.</Text>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
}

export {AddAccountDialog};
