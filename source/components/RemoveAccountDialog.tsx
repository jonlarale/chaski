import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {useInput} from 'ink';
import SelectInput from 'ink-select-input';
import {EmailAccount} from '../types/email.js';

interface RemoveAccountDialogProps {
	accounts: EmailAccount[];
	onComplete: (accountId: string | null) => void;
}

export const RemoveAccountDialog: React.FC<RemoveAccountDialogProps> = ({
	accounts,
	onComplete,
}) => {
	const [step, setStep] = useState<'select' | 'confirm'>('select');
	const [selectedAccount, setSelectedAccount] = useState<EmailAccount | null>(
		null,
	);

	useInput((_input, key) => {
		if (key.escape) {
			onComplete(null);
		}
	});

	const accountItems = accounts.map(account => ({
		label: `${account.email} (${account.provider})`,
		value: account.id,
	}));

	const handleAccountSelect = (item: {value: string}) => {
		const account = accounts.find(acc => acc.id === item.value);
		if (account) {
			setSelectedAccount(account);
			setStep('confirm');
		}
	};

	const confirmItems = [
		{label: 'Yes, remove this account', value: 'yes'},
		{label: 'No, cancel', value: 'no'},
	];

	const handleConfirm = (item: {value: string}) => {
		if (item.value === 'yes' && selectedAccount) {
			onComplete(selectedAccount.id);
		} else {
			onComplete(null);
		}
	};

	if (accounts.length === 0) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text bold color="red">
					No Accounts
				</Text>
				<Text dimColor>There are no accounts to remove.</Text>
				<Box marginTop={1}>
					<Text dimColor>Press ESC to go back</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold color="red">
				Remove Email Account
			</Text>
			<Text dimColor>Press ESC to cancel</Text>
			<Box marginTop={1}>
				{step === 'select' && (
					<Box flexDirection="column">
						<Text>Select account to remove:</Text>
						<Box marginTop={1}>
							<SelectInput items={accountItems} onSelect={handleAccountSelect} />
						</Box>
					</Box>
				)}

				{step === 'confirm' && selectedAccount && (
					<Box flexDirection="column">
						<Text bold color="yellow">
							⚠ Warning
						</Text>
						<Box marginTop={1}>
							<Text>Are you sure you want to remove this account?</Text>
						</Box>
						<Box marginTop={1}>
							<Text bold>{selectedAccount.email}</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>
								This will delete all cached messages and settings for this
								account.
							</Text>
						</Box>
						<Box marginTop={1}>
							<SelectInput items={confirmItems} onSelect={handleConfirm} />
						</Box>
					</Box>
				)}
			</Box>
		</Box>
	);
};
