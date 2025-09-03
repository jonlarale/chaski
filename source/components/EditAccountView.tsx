import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {EmailAccount} from '../types/email.js';
import {AccountStorageService} from '../services/accountStorageService.js';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';

interface EditAccountViewProps {
	onComplete: () => void;
	onCancel: () => void;
}

export const EditAccountView: React.FC<EditAccountViewProps> = ({
	onComplete,
	onCancel,
}) => {
	useInput((_, key) => {
		if (key.escape) {
			onCancel();
		}
	});
	const [accounts, setAccounts] = useState<EmailAccount[]>([]);
	const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(
		null,
	);
	const [editField, setEditField] = useState<string>('');
	const [newValue, setNewValue] = useState<string>('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string>('');

	useEffect(() => {
		loadAccounts();
	}, []);

	const loadAccounts = async () => {
		const storage = new AccountStorageService();
		const loadedAccounts = await storage.getAllAccounts();
		setAccounts(loadedAccounts);
		setLoading(false);
	};

	const handleAccountSelect = (item: {value: string}) => {
		const account = accounts.find(a => a.id === item.value);
		if (account) {
			setSelectedAccount(account);
		}
	};

	const handleFieldSelect = (item: {value: string}) => {
		setEditField(item.value);
		const currentValue = getFieldValue(item.value);
		setNewValue(currentValue);
	};

	const getFieldValue = (field: string): string => {
		if (!selectedAccount) return '';

		switch (field) {
			case 'email':
				return selectedAccount.email;
			case 'displayName':
				return selectedAccount.displayName || '';
			case 'imapHost':
				return selectedAccount.imapConfig?.host || '';
			case 'imapPort':
				return selectedAccount.imapConfig?.port?.toString() || '';
			case 'imapUsername':
				return selectedAccount.imapConfig?.username || '';
			case 'smtpHost':
				return selectedAccount.smtpConfig?.host || '';
			case 'smtpPort':
				return selectedAccount.smtpConfig?.port?.toString() || '';
			default:
				return '';
		}
	};

	const handleSave = async () => {
		if (!selectedAccount || !editField) return;

		try {
			const storage = new AccountStorageService();
			const updatedAccount = {...selectedAccount};

			switch (editField) {
				case 'email':
					updatedAccount.email = newValue;
					break;
				case 'displayName':
					updatedAccount.displayName = newValue;
					break;
				case 'imapHost':
					if (updatedAccount.imapConfig) {
						updatedAccount.imapConfig.host = newValue;
					}
					break;
				case 'imapPort':
					if (updatedAccount.imapConfig) {
						updatedAccount.imapConfig.port = parseInt(newValue, 10);
					}
					break;
				case 'imapUsername':
					if (updatedAccount.imapConfig) {
						updatedAccount.imapConfig.username = newValue;
					}
					break;
				case 'smtpHost':
					if (updatedAccount.smtpConfig) {
						updatedAccount.smtpConfig.host = newValue;
					}
					break;
				case 'smtpPort':
					if (updatedAccount.smtpConfig) {
						updatedAccount.smtpConfig.port = parseInt(newValue, 10);
					}
					break;
			}

			await storage.saveAccount(updatedAccount);
			onComplete();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to save account');
		}
	};

	if (loading) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>Loading accounts...</Text>
			</Box>
		);
	}

	if (accounts.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text color="yellow">No accounts found. Add an account first.</Text>
				<Text dimColor>Press ESC to go back</Text>
			</Box>
		);
	}

	if (!selectedAccount) {
		const accountItems = accounts.map(account => ({
			label: `${account.displayName || account.email} (${
				account.imapConfig?.host || 'No IMAP'
			})`,
			value: account.id,
		}));

		return (
			<Box flexDirection="column" padding={1}>
				<Text bold>Select an account to edit:</Text>
				<Box marginTop={1}>
					<SelectInput items={accountItems} onSelect={handleAccountSelect} />
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to cancel</Text>
				</Box>
			</Box>
		);
	}

	if (!editField) {
		const fieldItems = [
			{label: 'Email Address', value: 'email'},
			{label: 'Display Name', value: 'displayName'},
			{label: 'IMAP Host', value: 'imapHost'},
			{label: 'IMAP Port', value: 'imapPort'},
			{label: 'IMAP Username', value: 'imapUsername'},
		];

		if (selectedAccount.smtpConfig) {
			fieldItems.push(
				{label: 'SMTP Host', value: 'smtpHost'},
				{label: 'SMTP Port', value: 'smtpPort'},
			);
		}

		return (
			<Box flexDirection="column" padding={1}>
				<Text bold>
					Editing: {selectedAccount.displayName || selectedAccount.email}
				</Text>
				<Text dimColor>Select field to edit:</Text>
				<Box marginTop={1}>
					<SelectInput items={fieldItems} onSelect={handleFieldSelect} />
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to go back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>
				Editing {editField} for {selectedAccount.email}
			</Text>
			<Text dimColor>Current value: {getFieldValue(editField)}</Text>
			<Box marginTop={1}>
				<Text>New value: </Text>
				<TextInput
					value={newValue}
					onChange={setNewValue}
					onSubmit={handleSave}
				/>
			</Box>
			{error && (
				<Box marginTop={1}>
					<Text color="red">Error: {error}</Text>
				</Box>
			)}
			<Box marginTop={1}>
				<Text dimColor>Press Enter to save, ESC to cancel</Text>
			</Box>
		</Box>
	);
};
