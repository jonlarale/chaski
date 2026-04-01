import React, {useState, useEffect} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {colors, semanticColors, spacing} from '../constants/index.js';
import TextArea from './TextArea.js';
import TextInput from './TextInput.js';
import CommandBar from './CommandBar.js';

type EmailComposerProps = {
	readonly onSend: (email: ComposedEmail) => void;
	readonly onCancel: () => void;
	readonly replyTo?: {
		from: string;
		subject: string;
		date: string;
		preview: string;
	};
	readonly mode?: 'compose' | 'reply' | 'forward';
	readonly availableAccounts?: string[];
	readonly defaultAccount?: string;
};

type ComposedEmail = {
	from: string;
	to: string;
	cc: string;
	subject: string;
	body: string;
	inReplyTo?: string;
};

type FocusedField = 'from' | 'to' | 'cc' | 'subject' | 'body';

// Email validation regex
const isValidEmail = (email: string): boolean => {
	if (!email) return true; // Empty is valid (will be caught by required validation)
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// Handle multiple emails separated by comma
	const emails = email.split(',').map(event => event.trim());
	return emails.every(event => !event || emailRegex.test(event));
};

function EmailComposer({
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
}: EmailComposerProps) {
	const [from, setFrom] = useState(defaultAccount);
	const [selectedAccountIndex, setSelectedAccountIndex] = useState(
		availableAccounts.includes(defaultAccount)
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
		write('\u001B[2J\u001B[H');
		return () => {
			write('\u001B[2J\u001B[H');
		};
	}, [write]);

	useInput((input, key) => {
		if (sendingStatus !== 'idle') return;

		if (key.escape) {
			onCancel();
		} else if (key.downArrow) {
			// Down arrow to next field
			switch (focusedField) {
				case 'from': {
					setFocusedField('to');
					break;
				}

				case 'to': {
					setFocusedField('cc');
					break;
				}

				case 'cc': {
					setFocusedField('subject');
					break;
				}

				case 'subject': {
					setFocusedField('body');
					break;
				}

				default: {
					setFocusedField('from');
				}
			}
		} else if (key.upArrow) {
			// Up arrow to previous field
			switch (focusedField) {
				case 'body': {
					setFocusedField('subject');
					break;
				}

				case 'subject': {
					setFocusedField('cc');
					break;
				}

				case 'cc': {
					setFocusedField('to');
					break;
				}

				case 'to': {
					setFocusedField('from');
					break;
				}

				default: {
					setFocusedField('body');
				}
			}
		} else if (focusedField === 'from' && (key.leftArrow || key.rightArrow)) {
			// Handle account selection with arrow keys
			if (key.leftArrow && selectedAccountIndex > 0) {
				const newIndex = selectedAccountIndex - 1;
				setSelectedAccountIndex(newIndex);
				setFrom(availableAccounts[newIndex] ?? defaultAccount);
			} else if (
				key.rightArrow &&
				selectedAccountIndex < availableAccounts.length - 1
			) {
				const newIndex = selectedAccountIndex + 1;
				setSelectedAccountIndex(newIndex);
				setFrom(availableAccounts[newIndex] ?? defaultAccount);
			}
		} else if (key.ctrl && input === 's') {
			// Ctrl+S to send
			void handleSend();
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
			case 'reply': {
				return '↩️  Reply to Email';
			}

			case 'forward': {
				return '➡️  Forward Email';
			}

			default: {
				return '✉️  Compose New Email';
			}
		}
	};

	return (
		<Box flexDirection="column" height="100%">
			{/* Header */}
			<Box
				borderBottom
				borderLeft={false}
				borderRight={false}
				borderStyle="single"
				borderTop={false}
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
			<Box flexDirection="column" flexGrow={1} padding={2}>
				{/* From field */}
				<Box
					alignItems="center"
					borderColor={focusedField === 'from' ? colors.blue : undefined}
					borderStyle={focusedField === 'from' ? 'single' : undefined}
					flexDirection="row"
					marginBottom={spacing.composer.fieldMarginBottom}
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
									bold={index === selectedAccountIndex}
									color={
										index === selectedAccountIndex
											? semanticColors.composer.selectedAccount
											: colors.gray
									}
								>
									{index === selectedAccountIndex ? '[' : ' '}
									{account}
									{index === selectedAccountIndex ? ']' : ' '}
								</Text>
							</Box>
						))}
					</Box>
					{focusedField === 'from' && (
						<Text dimColor color={colors.darkGray}>
							{' '}
							(use ← → to select)
						</Text>
					)}
				</Box>

				{/* To field */}
				<Box
					borderColor={focusedField === 'to' ? colors.blue : undefined}
					borderStyle={focusedField === 'to' ? 'single' : undefined}
					marginBottom={spacing.composer.fieldMarginBottom}
					paddingX={focusedField === 'to' ? 1 : 0}
				>
					<Box alignItems="center" flexDirection="row">
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
						<Box alignItems="center" flexDirection="row" flexGrow={1}>
							<TextInput
								isFocus={focusedField === 'to'}
								placeholder="email@example.com, another@example.com"
								value={to}
								width={50}
								onChange={setTo}
								onSubmit={handleToSubmit}
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
					borderColor={focusedField === 'cc' ? colors.blue : undefined}
					borderStyle={focusedField === 'cc' ? 'single' : undefined}
					marginBottom={spacing.composer.fieldMarginBottom}
					paddingX={focusedField === 'cc' ? 1 : 0}
				>
					<Box alignItems="center" flexDirection="row">
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
						<Box alignItems="center" flexDirection="row" flexGrow={1}>
							<TextInput
								isFocus={focusedField === 'cc'}
								placeholder="cc@example.com, another@cc.com (optional)"
								value={cc}
								width={50}
								onChange={setCc}
								onSubmit={handleCcSubmit}
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
					borderColor={focusedField === 'subject' ? colors.blue : undefined}
					borderStyle={focusedField === 'subject' ? 'single' : undefined}
					marginBottom={spacing.composer.fieldMarginBottom}
					paddingX={focusedField === 'subject' ? 1 : 0}
				>
					<Box alignItems="center" flexDirection="row">
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
						<Box alignItems="center" flexDirection="row" flexGrow={1}>
							<TextInput
								isFocus={focusedField === 'subject'}
								placeholder="Email subject"
								value={subject}
								width={50}
								onChange={setSubject}
								onSubmit={handleSubjectSubmit}
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
					borderColor={focusedField === 'body' ? colors.blue : undefined}
					borderStyle={focusedField === 'body' ? 'single' : undefined}
					flexDirection="column"
					flexGrow={1}
					marginTop={spacing.marginSm}
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
					<Box marginTop={spacing.marginSm}>
						<TextArea
							isFocus={focusedField === 'body'}
							height={10}
							placeholder="Type your message here..."
							value={body}
							width={60}
							onChange={setBody}
							onDownArrowAtBottom={() => {
								setFocusedField('from');
							}}
							onUpArrowAtTop={() => {
								setFocusedField('subject');
							}}
						/>
					</Box>
				</Box>

				{/* Validation warnings */}
				<Box flexDirection="column" marginTop={spacing.marginSm}>
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
}

export default EmailComposer;
