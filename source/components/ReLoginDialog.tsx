import process from 'node:process';
import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import SelectInput from 'ink-select-input';
import open from 'open';
import type {EmailAccount} from '../types/email.js';
import type {EmailService} from '../services/emailService.js';
import {waitForOauthCallback} from '../services/oauthCallbackServer.js';

type ReLoginDialogProps = {
	readonly accounts: EmailAccount[];
	readonly emailService: EmailService;
	readonly onComplete: (account: EmailAccount | undefined) => void;
};

type Step =
	| 'select-account'
	| 'oauth-waiting'
	| 'oauth-success'
	| 'oauth-error';

function ReLoginDialog({
	accounts,
	emailService,
	onComplete,
}: ReLoginDialogProps) {
	const [step, setStep] = useState<Step>('select-account');
	const [oauthStatus, setOauthStatus] = useState('');
	const [oauthError, setOauthError] = useState('');
	const [selectedAccount, setSelectedAccount] = useState<
		EmailAccount | undefined
	>();

	useInput((_input, key) => {
		if (key.escape) {
			onComplete(undefined);
		}

		if ((step === 'oauth-error' || step === 'oauth-success') && key.return) {
			onComplete(step === 'oauth-success' ? selectedAccount : undefined);
		}
	});

	// Auto-select if only one account
	useEffect(() => {
		if (accounts.length === 1 && accounts[0]) {
			void startOauthFlow(accounts[0]);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const accountItems = accounts.map(a => ({
		label: `${a.email} (${a.provider})`,
		value: a.id,
	}));

	const startOauthFlow = async (account: EmailAccount) => {
		setSelectedAccount(account);
		setStep('oauth-waiting');

		try {
			let authUrl: string;
			let clientId: string;
			let clientSecret: string;

			if (account.provider === 'gmail') {
				clientId =
					account.oauth2Config?.clientId ??
					process.env['GMAIL_CLIENT_ID'] ??
					'';
				clientSecret =
					account.oauth2Config?.clientSecret ??
					process.env['GMAIL_CLIENT_SECRET'] ??
					'';

				if (!clientId || !clientSecret) {
					setOauthError(
						'GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env file',
					);
					setStep('oauth-error');
					return;
				}

				setOauthStatus('Generating authorization URL...');
				authUrl = await emailService.getGoogleAuthUrl(clientId, clientSecret);
			} else if (account.provider === 'outlook') {
				clientId =
					account.oauth2Config?.clientId ??
					process.env['OUTLOOK_CLIENT_ID'] ??
					'';
				clientSecret =
					account.oauth2Config?.clientSecret ??
					process.env['OUTLOOK_CLIENT_SECRET'] ??
					'';

				if (!clientId) {
					setOauthError('OUTLOOK_CLIENT_ID must be set in .env file');
					setStep('oauth-error');
					return;
				}

				setOauthStatus('Generating authorization URL...');
				authUrl = await emailService.getMicrosoftAuthUrl(clientId);
			} else {
				setOauthError(
					'Re-login is only supported for Gmail and Outlook OAuth2 accounts',
				);
				setStep('oauth-error');
				return;
			}

			setOauthStatus('Opening browser for authorization...');
			await open(authUrl);

			setOauthStatus('Waiting for authorization in browser...');
			const code = await waitForOauthCallback();

			setOauthStatus('Exchanging authorization code for tokens...');

			let oauthAccount: EmailAccount;
			if (account.provider === 'gmail') {
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

			// Merge new tokens into existing account (preserve id, email, configs)
			const updatedAccount: EmailAccount = {
				...account,
				oauth2Config: oauthAccount.oauth2Config,
			};

			setSelectedAccount(updatedAccount);
			setOauthStatus('Authorization successful!');
			setStep('oauth-success');
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			setOauthError(message);
			setStep('oauth-error');
		}
	};

	const handleAccountSelect = (item: {value: string}) => {
		const account = accounts.find(a => a.id === item.value);
		if (account) {
			void startOauthFlow(account);
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="green">
				Re-authenticate Account
			</Text>
			<Text dimColor>Press ESC to cancel</Text>
			<Box marginTop={1}>
				{step === 'select-account' && (
					<Box flexDirection="column">
						<Text>Select account to re-authenticate:</Text>
						<Box marginTop={1}>
							<SelectInput
								items={accountItems}
								onSelect={handleAccountSelect}
							/>
						</Box>
					</Box>
				)}

				{step === 'oauth-waiting' && (
					<Box flexDirection="column">
						<Text bold color="cyan">
							OAuth2 Authorization — {selectedAccount?.email}
						</Text>
						<Box marginTop={1}>
							<Text>{oauthStatus || 'Starting...'}</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Complete the authorization in your browser.</Text>
						</Box>
					</Box>
				)}

				{step === 'oauth-success' && (
					<Box flexDirection="column">
						<Text bold color="green">
							Login Successful
						</Text>
						<Box marginTop={1}>
							<Text>
								Tokens updated for {selectedAccount?.email}. Press Enter to
								continue.
							</Text>
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

export {ReLoginDialog};
