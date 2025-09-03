import React, {useState, useEffect} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import TextInput from './TextInput.js';
import TextArea from './TextArea.js';
import CommandBar from './CommandBar.js';
import {colors, semanticColors, spacing} from '../constants/index.js';

interface EmailComposerProps {
	onSend: (email: ComposedEmail) => void;
	onCancel: () => void;
	replyTo?: {
		from: string;
		subject: string;
		date: string;
		preview: string;
	};
	mode?: 'compose' | 'reply' | 'forward';
	availableAccounts?: string[];
	defaultAccount?: string;
}

interface ComposedEmail {
	from: string;
	to: string;
	cc: string;
	subject: string;
	body: string;
	inReplyTo?: string;
}

type FocusedField = 'from' | 'to' | 'cc' | 'subject' | 'body';

// Email validation regex
const isValidEmail = (email: string): boolean => {
	if (!email) return true; // Empty is valid (will be caught by required validation)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// Handle multiple emails separated by comma
	const emails = email.split(',').map(e => e.trim());
	return emails.every(e => !e || emailRegex.test(e));
};

const EmailComposer: React.FC<EmailComposerProps> = ({
	onSend,
	onCancel,
	replyTo,
	mode = 'compose',
	availableAccounts = [
		'example@gmail.com',
		'work@company.com',
		'personal@yahoo.com',
	],
	defaultAccount = 'example@gmail.com',
}) => {
	const [from, setFrom] = useState(defaultAccount);
	const [selectedAccountIndex, setSelectedAccountIndex] = useState(
		availableAccounts.indexOf(defaultAccount) >= 0
			? availableAccounts.indexOf(defaultAccount)
			: 0,
	);
	const [to, setTo] = useState(mode === 'reply' && replyTo ? replyTo.from : '');
	const [cc, setCc] = useState('');
	const [subject, setSubject] = useState(() => {
		if (mode === 'reply' && replyTo) {
			return replyTo.subject.startsWith('Re: ')
				? replyTo.subject
				: `Re: ${replyTo.subject}`;
		}
		if (mode === 'forward' && replyTo) {
			return replyTo.subject.startsWith('Fwd: ')
				? replyTo.subject
				: `Fwd: ${replyTo.subject}`;
		}
		return '';
	});
	const [body, setBody] = useState(() => {
		if ((mode === 'reply' || mode === 'forward') && replyTo) {
			return `\n\n---\nOn ${replyTo.date}, ${replyTo.from} wrote:\n${replyTo.preview}`;
		}
		return '';
	});
	const [focusedField, setFocusedField] = useState<FocusedField>('from');
	const [sendingStatus, setSendingStatus] = useState<
		'idle' | 'sending' | 'sent'
	>('idle');
	const {write} = useStdout();

	// Clear screen when component mounts and unmounts
	useEffect(() => {
		write('\x1b[2J\x1b[H');
		return () => {
			write('\x1b[2J\x1b[H');
		};
	}, [write]);

	useInput((input, key) => {
		if (sendingStatus !== 'idle') return;

		if (key.escape) {
			onCancel();
		} else if (key.downArrow) {
			// Down arrow to next field
			if (focusedField === 'from') {
				setFocusedField('to');
			} else if (focusedField === 'to') {
				setFocusedField('cc');
			} else if (focusedField === 'cc') {
				setFocusedField('subject');
			} else if (focusedField === 'subject') {
				setFocusedField('body');
			} else {
				setFocusedField('from');
			}
		} else if (key.upArrow) {
			// Up arrow to previous field
			if (focusedField === 'body') {
				setFocusedField('subject');
			} else if (focusedField === 'subject') {
				setFocusedField('cc');
			} else if (focusedField === 'cc') {
				setFocusedField('to');
			} else if (focusedField === 'to') {
				setFocusedField('from');
			} else {
				setFocusedField('body');
			}
		} else if (focusedField === 'from' && (key.leftArrow || key.rightArrow)) {
			// Handle account selection with arrow keys
			if (key.leftArrow && selectedAccountIndex > 0) {
				const newIndex = selectedAccountIndex - 1;
				setSelectedAccountIndex(newIndex);
				setFrom(availableAccounts[newIndex] || defaultAccount);
			} else if (
				key.rightArrow &&
				selectedAccountIndex < availableAccounts.length - 1
			) {
				const newIndex = selectedAccountIndex + 1;
				setSelectedAccountIndex(newIndex);
				setFrom(availableAccounts[newIndex] || defaultAccount);
			}
		} else if (key.ctrl && input === 's') {
			// Ctrl+S to send
			handleSend();
		}
	});

	const handleSend = async () => {
		if (!from || !to || !subject || !body) {
			return;
		}

		// Validate email addresses
		if (!isValidEmail(to) || (cc && !isValidEmail(cc))) {
			return;
		}

		setSendingStatus('sending');

		// Simulate sending delay
		setTimeout(() => {
			setSendingStatus('sent');
			const email: ComposedEmail = {
				from,
				to,
				cc,
				subject,
				body,
				inReplyTo: replyTo?.from,
			};
			setTimeout(() => {
				onSend(email);
			}, 500);
		}, 1500);
	};

	const handleToSubmit = () => {
		setFocusedField('cc');
	};

	const handleCcSubmit = () => {
		setFocusedField('subject');
	};

	const handleSubjectSubmit = () => {
		setFocusedField('body');
	};

	if (sendingStatus === 'sending') {
		return (
			<Box flexDirection="column" padding={2}>
				<Text color={colors.blue}>📤 Sending email...</Text>
				<Box marginTop={1}>
					<Text color={colors.blue}>━━━━━━━━━━━━━━━━━━━━</Text>
				</Box>
			</Box>
		);
	}

	if (sendingStatus === 'sent') {
		return (
			<Box flexDirection="column" padding={2}>
				<Text color={colors.green}>✓ Email sent successfully!</Text>
			</Box>
		);
	}

	const getModeTitle = () => {
		switch (mode) {
			case 'reply':
				return '↩️  Reply to Email';
			case 'forward':
				return '➡️  Forward Email';
			default:
				return '✉️  Compose New Email';
		}
	};

	return (
		<Box flexDirection="column" height="100%">
			{/* Header */}
			<Box
				borderStyle="single"
				borderBottom={true}
				borderTop={false}
				borderLeft={false}
				borderRight={false}
				padding={1}
			>
				<Box justifyContent="space-between">
					<Text bold color={semanticColors.composer.header}>
						{getModeTitle()}
					</Text>
					<Text color={colors.gray}>Press ESC to cancel</Text>
				</Box>
			</Box>

			{/* Form */}
			<Box flexDirection="column" padding={2} flexGrow={1}>
				{/* From field */}
				<Box
					marginBottom={spacing.composer.fieldMarginBottom}
					flexDirection="row"
					alignItems="center"
					borderStyle={focusedField === 'from' ? 'single' : undefined}
					borderColor={focusedField === 'from' ? colors.blue : undefined}
					paddingX={focusedField === 'from' ? 1 : 0}
				>
					<Box width={spacing.composer.labelWidth}>
						<Text
							bold
							color={
								focusedField === 'from'
									? semanticColors.composer.labelFocused
									: semanticColors.composer.label
							}
						>
							From:
						</Text>
					</Box>
					<Box flexDirection="row">
						{availableAccounts.map((account, index) => (
							<Box key={account} marginRight={2}>
								<Text
									color={
										index === selectedAccountIndex
											? semanticColors.composer.selectedAccount
											: colors.gray
									}
									bold={index === selectedAccountIndex}
								>
									{index === selectedAccountIndex ? '[' : ' '}
									{account}
									{index === selectedAccountIndex ? ']' : ' '}
								</Text>
							</Box>
						))}
					</Box>
					{focusedField === 'from' && (
						<Text color={colors.darkGray} dimColor>
							{' '}
							(use ← → to select)
						</Text>
					)}
				</Box>

				{/* To field */}
				<Box
					marginBottom={spacing.composer.fieldMarginBottom}
					borderStyle={focusedField === 'to' ? 'single' : undefined}
					borderColor={focusedField === 'to' ? colors.blue : undefined}
					paddingX={focusedField === 'to' ? 1 : 0}
				>
					<Box flexDirection="row" alignItems="center">
						<Box width={spacing.composer.labelWidth}>
							<Text
								bold
								color={
									focusedField === 'to'
										? semanticColors.composer.labelFocused
										: semanticColors.composer.label
								}
							>
								To:
							</Text>
						</Box>
						<Box flexGrow={1} flexDirection="row" alignItems="center">
							<TextInput
								value={to}
								onChange={setTo}
								placeholder="email@example.com, another@example.com"
								focus={focusedField === 'to'}
								onSubmit={handleToSubmit}
								width={50}
							/>
							{to && !isValidEmail(to) && (
								<Box marginLeft={1}>
									<Text color={semanticColors.composer.validation.error}>
										✗ Invalid email
									</Text>
								</Box>
							)}
							{!to && focusedField === 'to' && (
								<Box marginLeft={1}>
									<Text color={semanticColors.composer.validation.warning}>
										⚠ Required
									</Text>
								</Box>
							)}
						</Box>
					</Box>
				</Box>

				{/* CC field */}
				<Box
					marginBottom={spacing.composer.fieldMarginBottom}
					borderStyle={focusedField === 'cc' ? 'single' : undefined}
					borderColor={focusedField === 'cc' ? colors.blue : undefined}
					paddingX={focusedField === 'cc' ? 1 : 0}
				>
					<Box flexDirection="row" alignItems="center">
						<Box width={spacing.composer.labelWidth}>
							<Text
								bold
								color={
									focusedField === 'cc'
										? semanticColors.composer.labelFocused
										: semanticColors.composer.label
								}
							>
								CC:
							</Text>
						</Box>
						<Box flexGrow={1} flexDirection="row" alignItems="center">
							<TextInput
								value={cc}
								onChange={setCc}
								placeholder="cc@example.com, another@cc.com (optional)"
								focus={focusedField === 'cc'}
								onSubmit={handleCcSubmit}
								width={50}
							/>
							{cc && !isValidEmail(cc) && (
								<Box marginLeft={1}>
									<Text color={semanticColors.composer.validation.error}>
										✗ Invalid email
									</Text>
								</Box>
							)}
						</Box>
					</Box>
				</Box>

				{/* Subject field */}
				<Box
					marginBottom={spacing.composer.fieldMarginBottom}
					borderStyle={focusedField === 'subject' ? 'single' : undefined}
					borderColor={focusedField === 'subject' ? colors.blue : undefined}
					paddingX={focusedField === 'subject' ? 1 : 0}
				>
					<Box flexDirection="row" alignItems="center">
						<Box width={spacing.composer.labelWidth}>
							<Text
								bold
								color={
									focusedField === 'subject'
										? semanticColors.composer.labelFocused
										: semanticColors.composer.label
								}
							>
								Subject:
							</Text>
						</Box>
						<Box flexGrow={1} flexDirection="row" alignItems="center">
							<TextInput
								value={subject}
								onChange={setSubject}
								placeholder="Email subject"
								focus={focusedField === 'subject'}
								onSubmit={handleSubjectSubmit}
								width={50}
							/>
							{!subject && focusedField === 'subject' && (
								<Box marginLeft={1}>
									<Text color={semanticColors.composer.validation.warning}>
										⚠ Required
									</Text>
								</Box>
							)}
						</Box>
					</Box>
				</Box>

				{/* Body field */}
				<Box
					marginTop={spacing.marginSM}
					flexDirection="column"
					flexGrow={1}
					borderStyle={focusedField === 'body' ? 'single' : undefined}
					borderColor={focusedField === 'body' ? colors.blue : undefined}
					padding={focusedField === 'body' ? 1 : 0}
				>
					<Text
						bold
						color={
							focusedField === 'body'
								? semanticColors.composer.labelFocused
								: semanticColors.composer.label
						}
					>
						Message:
					</Text>
					<Box marginTop={spacing.marginSM}>
						<TextArea
							value={body}
							onChange={setBody}
							placeholder="Type your message here..."
							focus={focusedField === 'body'}
							height={10}
							width={60}
							onUpArrowAtTop={() => setFocusedField('subject')}
							onDownArrowAtBottom={() => setFocusedField('from')}
						/>
					</Box>
				</Box>

				{/* Validation warnings */}
				<Box marginTop={spacing.marginSM} flexDirection="column">
					{!to && (
						<Text color={semanticColors.composer.validation.warning}>
							⚠ Please enter a recipient
						</Text>
					)}
					{to && !isValidEmail(to) && (
						<Text color={semanticColors.composer.validation.error}>
							✗ Invalid recipient email format
						</Text>
					)}
					{cc && !isValidEmail(cc) && (
						<Text color={semanticColors.composer.validation.error}>
							✗ Invalid CC email format
						</Text>
					)}
					{!subject && (
						<Text color={semanticColors.composer.validation.warning}>
							⚠ Please enter a subject
						</Text>
					)}
					{!body && (
						<Text color={semanticColors.composer.validation.warning}>
							⚠ Please enter a message
						</Text>
					)}
				</Box>
			</Box>

			{/* Footer */}
			<CommandBar
				onQuit={onCancel}
				view="compose"
				commands={[
					{key: '↑↓', label: 'Navigate', action: 'navigate'},
					{key: '←→', label: 'Select account', action: 'select'},
					{key: 'Ctrl+S', label: 'Send', action: 'primary'},
					{key: 'ESC', label: 'Cancel', action: 'back'},
				]}
			/>
		</Box>
	);
};

export default EmailComposer;
