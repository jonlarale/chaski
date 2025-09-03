import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {useInput} from 'ink';
import TextInput from 'ink-text-input';
import SelectInput from 'ink-select-input';
import {EmailAccount} from '../types/email.js';

interface AddAccountDialogProps {
	onComplete: (account: EmailAccount | null) => void;
}

type Step =
	| 'provider'
	| 'authType'
	| 'email'
	| 'password'
	| 'imap'
	| 'smtp'
	| 'oauth';

export const AddAccountDialog: React.FC<AddAccountDialogProps> = ({
	onComplete,
}) => {
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

	useInput((_input, key) => {
		if (key.escape) {
			onComplete(null);
		}
	});

	const providerItems = [
		{label: 'Gmail', value: 'gmail'},
		{label: 'Outlook/Office 365', value: 'outlook'},
		{label: 'Other (IMAP/SMTP)', value: 'imap'},
	];

	const authTypeItems = [
		{label: 'OAuth2 (Recommended)', value: 'oauth2'},
		{label: 'Password', value: 'password'},
	];

	const handleProviderSelect = (item: {value: string}) => {
		setAccount({
			...account,
			provider: item.value as 'gmail' | 'outlook' | 'imap',
		});

		if (item.value === 'imap') {
			setStep('email');
		} else {
			setStep('authType');
		}
	};

	const handleAuthTypeSelect = (item: {value: string}) => {
		setAccount({...account, authType: item.value as 'oauth2' | 'password'});

		if (item.value === 'oauth2') {
			setStep('oauth');
		} else {
			setStep('email');
		}
	};

	const handleEmailSubmit = (email: string) => {
		// Ensure email is in proper format
		if (!email.includes('@') && account.provider === 'imap') {
			console.log('Please enter a full email address (e.g., user@domain.com)');
			return;
		}

		setAccount({...account, email, displayName: email});

		if (account.authType === 'password') {
			setStep('password');
		} else if (account.provider === 'imap') {
			setStep('imap');
		} else {
			// For OAuth2, we're done
			onComplete(account as EmailAccount);
		}
	};

	const handlePasswordSubmit = (password: string) => {
		if (account.provider === 'gmail') {
			setAccount({
				...account,
				imapConfig: {
					host: 'imap.gmail.com',
					port: 993,
					secure: true,
					username: account.email,
					password,
				},
				smtpConfig: {
					host: 'smtp.gmail.com',
					port: 587,
					secure: false,
					username: account.email,
					password,
				},
			});
			onComplete(account as EmailAccount);
		} else if (account.provider === 'outlook') {
			setAccount({
				...account,
				imapConfig: {
					host: 'outlook.office365.com',
					port: 993,
					secure: true,
					username: account.email,
					password,
				},
				smtpConfig: {
					host: 'smtp.office365.com',
					port: 587,
					secure: false,
					username: account.email,
					password,
				},
			});
			onComplete(account as EmailAccount);
		} else {
			setStep('imap');
		}
	};

	const handleImapSubmit = (value: string) => {
		if (!account.imapConfig) {
			setAccount({
				...account,
				imapConfig: {
					host: value,
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
				imapConfig: {...account.imapConfig, password: value},
			});
			setStep('smtp');
		}
	};

	const handleSmtpSubmit = (value: string) => {
		if (!account.smtpConfig) {
			setAccount({
				...account,
				smtpConfig: {
					host: value,
					port: 587,
					secure: false,
					username: account.email,
					password: account.imapConfig?.password,
				},
			});
			onComplete(account as EmailAccount);
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
						<Text dimColor italic>
							For Gmail: Use an App Password
						</Text>
						<Text dimColor italic>
							For Outlook: Use your account password
						</Text>
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
						{!account.imapConfig ? (
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
						) : (
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

				{step === 'oauth' && (
					<Box flexDirection="column">
						<Text bold color="yellow">
							OAuth2 Setup Required
						</Text>
						<Box marginTop={1} flexDirection="column">
							<Text>To use OAuth2 authentication, you need to:</Text>
							<Text>1. Set up OAuth2 credentials for your app</Text>
							<Text>2. Configure redirect URLs</Text>
							<Text>3. Handle the OAuth2 flow</Text>
							<Box marginTop={1}>
								<Text dimColor>
									This requires additional setup. Press Enter to continue with
									password auth instead.
								</Text>
							</Box>
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
};
