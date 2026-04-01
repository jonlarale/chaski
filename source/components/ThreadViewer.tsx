import React, {useState, useMemo, useEffect} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import type {EmailService} from '../services/emailService.js';
import type {EmailAccount, EmailMessage} from '../types/email.js';
import type {AssistantMessage, AssistantStatus} from '../types/assistant.js';
import CommandBar from './CommandBar.js';
import CommandInput from './CommandInput.js';
import AssistantPanel from './AssistantPanel.js';

type Message = {
	id: string;
	from: string;
	subject: string;
	date: string;
	read: boolean;
	preview: string;
	threadCount?: number;
	body?: {
		text?: string;
		html?: string;
	};
	_original?: EmailMessage;
};

type ThreadMessage = {
	id: string;
	from: string;
	date: string;
	time: string;
	content: string;
	isOriginal: boolean;
	subject?: string;
};

type ThreadViewerProps = {
	readonly originalMessage: Message;
	readonly onBack: () => void;
	readonly emailService: EmailService;
	readonly emailAccounts: EmailAccount[];
	readonly isCommandInputActive: boolean;
	readonly onCommandInputDeactivate: () => void;
	readonly onCommand: (command: string) => void;
	readonly assistantMessages: AssistantMessage[];
	readonly assistantStatus: AssistantStatus;
	readonly assistantError?: string | undefined;
};

// Helper to extract email body content
const extractEmailContent = (body?: {text?: string; html?: string}): string => {
	if (body?.text) {
		return body.text;
	}

	if (body?.html) {
		// Simple HTML stripping
		return body.html
			.replace(/<[^>]*>/g, '')
			.replace(/&nbsp;/g, ' ')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
			.replace(/&quot;/g, '"')
			.replace(/&#39;/g, "'")
			.replace(/\s+/g, ' ')
			.trim();
	}

	return 'No content available';
};

// Mock data for conversation threads
const mockThreads: Record<string, ThreadMessage[]> = {
	'1-gmail': [
		// Meeting reminder thread (Gmail)
		{
			id: '1-gmail-original',
			from: 'john@example.com',
			date: '2024-01-15',
			time: '10:30 AM',
			content: `Don't forget about our meeting tomorrow at 2 PM. We'll be discussing the Q1 roadmap and budget allocations.

Please prepare:
- Your team's progress report
- Budget requirements for next quarter
- Any blockers or concerns

See you there!`,
			isOriginal: true,
		},
		{
			id: '1-gmail-reply-1',
			from: 'you@example.com',
			date: '2024-01-15',
			time: '11:15 AM',
			content: `Thanks for the reminder John! I'll have everything ready.

Quick question: Should I include the hiring plan in the budget discussion?`,
			isOriginal: false,
		},
		{
			id: '1-gmail-reply-2',
			from: 'john@example.com',
			date: '2024-01-15',
			time: '11:45 AM',
			content: `Yes, definitely include the hiring plan. That's a big part of our Q1 strategy.`,
			isOriginal: false,
		},
		{
			id: '1-gmail-reply-3',
			from: 'sarah@example.com',
			date: '2024-01-15',
			time: '2:30 PM',
			content: `I'll join a bit late, around 2:15 PM. Currently finishing up with the client call.`,
			isOriginal: false,
		},
	],
	'3-gmail': [
		// Project proposal thread (Gmail)
		{
			id: '3-gmail-original',
			from: 'example@gmail.com',
			date: '2024-01-12',
			time: '9:00 AM',
			content: `Please find attached the project proposal for review.

Key highlights:
- Timeline: 3 months
- Budget: $50K
- Team size: 5 developers
- Expected ROI: 200%

Looking forward to your feedback!`,
			isOriginal: true,
		},
		{
			id: '3-gmail-reply-1',
			from: 'manager@company.com',
			date: '2024-01-12',
			time: '2:30 PM',
			content: `Great proposal! I have a few questions about the timeline. Can we schedule a call?`,
			isOriginal: false,
		},
	],
	'6-work': [
		// Q1 Budget Review thread (Work)
		{
			id: '6-work-original',
			from: 'boss@company.com',
			date: '2024-01-15',
			time: '8:00 AM',
			content: `Let's schedule a meeting to review the Q1 budget and discuss our priorities.

Agenda items:
- Department budget allocation
- New project funding
- Resource planning
- Performance bonuses

Please come prepared with your team's requirements.`,
			isOriginal: true,
		},
		{
			id: '6-work-reply-1',
			from: 'alice@company.com',
			date: '2024-01-15',
			time: '9:30 AM',
			content: `I'll need additional budget for the new hires. Can we discuss this in detail?`,
			isOriginal: false,
		},
		{
			id: '6-work-reply-2',
			from: 'bob@company.com',
			date: '2024-01-15',
			time: '10:15 AM',
			content: `The marketing budget needs a 20% increase for the new campaign.`,
			isOriginal: false,
		},
		{
			id: '6-work-reply-3',
			from: 'you@company.com',
			date: '2024-01-15',
			time: '11:00 AM',
			content: `I've prepared a detailed breakdown of our department's needs. Will share it before the meeting.`,
			isOriginal: false,
		},
		{
			id: '6-work-reply-4',
			from: 'boss@company.com',
			date: '2024-01-15',
			time: '1:30 PM',
			content: `Perfect! Let's meet tomorrow at 2 PM in the conference room.`,
			isOriginal: false,
		},
	],
	'11-yahoo': [
		// Account Statement thread (Yahoo)
		{
			id: '11-yahoo-original',
			from: 'bank@bank.com',
			date: '2024-01-13',
			time: '6:00 AM',
			content: `Your monthly account statement is ready for review.

Account Summary:
- Starting balance: $2,500.00
- Deposits: $3,200.00
- Withdrawals: $1,800.00
- Ending balance: $3,900.00

Thank you for banking with us!`,
			isOriginal: true,
		},
		{
			id: '11-yahoo-reply-1',
			from: 'personal@yahoo.com',
			date: '2024-01-13',
			time: '8:30 AM',
			content: `Thank you for the statement. Everything looks correct!`,
			isOriginal: false,
		},
	],
};

function ThreadViewer({
	originalMessage,
	onBack,
	emailService,
	emailAccounts,
	isCommandInputActive,
	onCommandInputDeactivate,
	onCommand,
	assistantMessages,
	assistantStatus,
	assistantError,
}: ThreadViewerProps) {
	const [currentPage, setCurrentPage] = useState(0);
	const [loading, setLoading] = useState(true);
	const [threadEmails, setThreadEmails] = useState<EmailMessage[]>([]);
	const {write} = useStdout();

	// Clear screen when component mounts and unmounts
	useEffect(() => {
		// Clear screen on mount
		write('\u001B[2J\u001B[H');

		return () => {
			// Clear screen on unmount
			write('\u001B[2J\u001B[H');
		};
	}, [write]);

	// Fetch thread messages when component mounts
	useEffect(() => {
		const fetchThreadMessages = async () => {
			if (!originalMessage._original) {
				setLoading(false);

				return;
			}

			try {
				const original = originalMessage._original;
				// Find the account that owns this message
				const account = emailAccounts.find(
					acc => acc.id === original.accountId,
				);

				if (!account) {
					console.error('Account not found for message');
					setLoading(false);

					return;
				}

				// Fetch all messages in the thread
				const messages = await emailService.getThreadMessages(
					account.id,
					original.folder,
					original.messageId,
					original.references ?? [],
				);

				setThreadEmails(messages);
			} catch (error_: unknown) {
				console.error('Error fetching thread messages:', error_);
			} finally {
				setLoading(false);
			}
		};

		void fetchThreadMessages();
	}, [originalMessage, emailService, emailAccounts]);

	const threadMessages = useMemo(() => {
		// If we have real thread emails, convert them
		if (threadEmails.length > 0) {
			return threadEmails.map(email => {
				const from = email.from[0];
				const fromString = from?.name
					? `${from.name} <${from.address}>`
					: from?.address ?? 'Unknown';
				const messageDate = new Date(email.date);

				return {
					id: email.id,
					from: fromString,
					date: messageDate.toLocaleDateString('en-US', {
						year: 'numeric',
						month: 'short',
						day: 'numeric',
					}),
					time: messageDate.toLocaleTimeString('en-US', {
						hour: '2-digit',
						minute: '2-digit',
					}),
					content: extractEmailContent(email.body),
					isOriginal: email.id === originalMessage.id,
					subject: email.subject,
				};
			});
		}

		// Check if we have mock thread data
		const mockThread = mockThreads[originalMessage.id];
		if (mockThread && mockThread.length > 0) {
			return mockThread;
		}

		// Otherwise, create a thread from the original message only
		const messageDate = new Date(originalMessage.date);
		const thread: ThreadMessage[] = [
			{
				id: originalMessage.id,
				from: originalMessage.from,
				date: messageDate.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'short',
					day: 'numeric',
				}),
				time: messageDate.toLocaleTimeString('en-US', {
					hour: '2-digit',
					minute: '2-digit',
				}),
				content: extractEmailContent(originalMessage.body),
				isOriginal: true,
				subject: originalMessage.subject,
			},
		];

		return thread;
	}, [originalMessage, threadEmails]);

	// Calculate expanded content lines for each message
	const expandedContent = useMemo(() => {
		const lines: Array<{
			type: 'header' | 'content' | 'separator';
			messageIndex: number;
			content: string;
			isOriginal?: boolean;
			from?: string;
			date?: string;
			time?: string;
		}> = [];

		for (const [index, message] of threadMessages.entries()) {
			// Add spacing before non-first messages
			if (index > 0) {
				lines.push({
					type: 'separator',
					messageIndex: index,
					content: '',
				});
			}

			// Message header
			lines.push({
				type: 'header',
				messageIndex: index,
				content: `${message.isOriginal ? '📧' : '🔄'} ${message.from}`,
				isOriginal: message.isOriginal,
				from: message.from,
				date: message.date,
				time: message.time,
			});

			// Message content (split into lines)
			const contentLines = message.content.split('\n');

			for (const line of contentLines) {
				lines.push({
					type: 'content',
					messageIndex: index,
					content: line,
				});
			}
		}

		return lines;
	}, [threadMessages]);

	// Pagination configuration
	const contentHeight = 15; // Available height for content
	const linesPerPage = contentHeight;

	const totalPages = Math.max(
		1,
		Math.ceil(expandedContent.length / linesPerPage),
	);
	const startLine = currentPage * linesPerPage;
	const endLine = Math.min(startLine + linesPerPage, expandedContent.length);
	const visibleLines = expandedContent.slice(startLine, endLine);

	useInput((_input, key) => {
		// If command input is active, don't handle navigation keys
		if (isCommandInputActive) return;

		if (key.downArrow && !key.shift) {
			// Down arrow: advance page
			setCurrentPage(Math.min(totalPages - 1, currentPage + 1));
		} else if (key.upArrow && !key.shift) {
			// Up arrow: go back page
			setCurrentPage(Math.max(0, currentPage - 1));
		} else if (key.upArrow && key.shift) {
			// Shift + Up arrow: go to beginning
			setCurrentPage(0);
		} else if (key.downArrow && key.shift) {
			// Shift + Down arrow: go to end
			setCurrentPage(totalPages - 1);
		} else if (key.escape ?? key.leftArrow) {
			// ESC or ← to go back
			onBack();
		}
	});

	const renderLine = (line: (typeof expandedContent)[0], index: number) => {
		switch (line.type) {
			case 'header': {
				return (
					<Box
						key={`${line.messageIndex}-header-${index}`}
						flexDirection="column"
					>
						<Box justifyContent="space-between" width="100%">
							<Text bold color={line.isOriginal ? 'blue' : 'cyan'}>
								{line.content}
							</Text>
							{line.date && line.time && (
								<Text color="gray">
									{line.date} {line.time}
								</Text>
							)}
						</Box>
					</Box>
				);
			}

			case 'content': {
				return (
					<Box key={`${line.messageIndex}-content-${index}`} paddingLeft={2}>
						<Text>{line.content || ' '}</Text>
					</Box>
				);
			}

			case 'separator': {
				return (
					<Box key={`${line.messageIndex}-separator-${index}`} marginY={1}>
						<Text dimColor color="gray">
							{'─'.repeat(60)}
						</Text>
					</Box>
				);
			}

			default: {
				return null;
			}
		}
	};

	// Show loading state
	if (loading) {
		return (
			<Box flexDirection="column" height="100%">
				<Box
					borderBottom
					borderLeft={false}
					borderRight={false}
					borderStyle="single"
					borderTop={false}
					padding={1}
				>
					<Box justifyContent="space-between">
						<Text bold color="blue">
							💬 Loading Thread...
						</Text>
						<Text color="gray">ESC to go back</Text>
					</Box>
				</Box>
				<Box padding={1}>
					<Text color="yellow">⏳ Fetching thread messages...</Text>
				</Box>
			</Box>
		);
	}

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
				<Box flexDirection="column" width="100%">
					<Box justifyContent="space-between">
						<Text bold color="blue">
							💬 Email Thread
						</Text>
						<Text color="gray">ESC to go back</Text>
					</Box>
					<Box marginTop={1}>
						<Text bold color="white">
							{originalMessage.subject}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text color="gray">
							{threadMessages.length === 1
								? 'Single message'
								: `${threadMessages.length} messages`}
							{totalPages > 1 && ` • Page ${currentPage + 1}/${totalPages}`}
						</Text>
					</Box>
				</Box>
			</Box>

			{/* Content Area */}
			<Box
				flexDirection="column"
				flexGrow={1}
				height={contentHeight}
				padding={1}
			>
				{visibleLines.map((line, index) => renderLine(line, index))}

				{/* Fill remaining space if needed */}
				{visibleLines.length < linesPerPage && <Box flexGrow={1} />}
			</Box>

			{/* Navigation indicators */}
			{currentPage > 0 && (
				<Box justifyContent="center">
					<Text color="blue">▲ More content above (↑) ▲</Text>
				</Box>
			)}

			{currentPage < totalPages - 1 && (
				<Box justifyContent="center">
					<Text color="blue">▼ More content below (↓) ▼</Text>
				</Box>
			)}

			{/* Command Input */}
			<AssistantPanel
				error={assistantError}
				messages={assistantMessages}
				status={assistantStatus}
			/>
			<CommandInput
				isActive={isCommandInputActive}
				onCommand={onCommand}
				onDeactivate={onCommandInputDeactivate}
			/>

			{/* Footer */}
			<CommandBar
				commands={[
					{key: '↑↓', label: 'Navigate', action: 'navigate'},
					{key: 'Shift+↑', label: 'Top', action: 'select'},
					{key: 'Shift+↓', label: 'End', action: 'select'},
					{key: 'ESC', label: 'Back', action: 'back'},
				]}
				isCommandInputActive={isCommandInputActive}
				view="thread"
				onQuit={onBack}
			/>
		</Box>
	);
}

export default ThreadViewer;
