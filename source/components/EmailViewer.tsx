import type {Buffer} from 'node:buffer';
import React, {useState, useMemo, useEffect, useRef} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import type {AssistantMessage, AssistantStatus} from '../types/assistant.js';
import {DownloadService} from '../services/downloadService.js';
import {colors, semanticColors, spacing} from '../constants/index.js';
import AssistantPanel from './AssistantPanel.js';
import CommandBar from './CommandBar.js';
import CommandInput from './CommandInput.js';

type Message = {
	id: string;
	from: string;
	subject: string;
	date: string;
	read: boolean;
	preview: string;
	body?: {
		text?: string;
		html?: string;
	};
	attachments?: Array<{
		filename: string;
		contentType: string;
		size: number;
		contentId?: string;
		content?: Buffer;
	}>;
};

type EmailViewerProps = {
	readonly message: Message;
	readonly onBack: () => void;
	readonly onReply?: (message: Message) => void;
	readonly onForward?: (message: Message) => void;
	readonly isCommandInputActive: boolean;
	readonly onCommandInputDeactivate: () => void;
	readonly onCommand: (command: string) => void;
	readonly downloadService?: DownloadService;
	readonly assistantMessages: AssistantMessage[];
	readonly assistantStatus: AssistantStatus;
	readonly assistantError?: string | undefined;
};

function EmailViewer({
	message,
	onBack,
	onReply,
	onForward,
	isCommandInputActive,
	onCommandInputDeactivate,
	onCommand,
	downloadService,
	assistantMessages,
	assistantStatus,
	assistantError,
}: EmailViewerProps) {
	const [scrollPosition, setScrollPosition] = useState(0);
	const [scrollVelocity, setScrollVelocity] = useState(1);
	const [downloadStatus, setDownloadStatus] = useState<string>('');
	const [waitingForDownloadInput, setWaitingForDownloadInput] = useState(false);
	const scrollTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
	const {write, stdout} = useStdout();

	// Reset scroll position when message changes
	useEffect(() => {
		setScrollPosition(0);
		setScrollVelocity(1);
	}, [message.id]);

	// Clear screen when component mounts and unmounts
	useEffect(() => {
		// Clear screen on mount
		write('\u001B[2J\u001B[H');

		return () => {
			// Clear screen on unmount
			write('\u001B[2J\u001B[H');
		};
	}, [write]);

	// Get the full email content from the body
	const fullContent = useMemo(() => {
		if (message.body?.text) {
			// Use the text content if available
			return message.body.text;
		}

		if (message.body?.html) {
			// If only HTML is available, strip HTML tags for basic display
			// This is a simple implementation - a full HTML parser would be better
			return message.body.html
				.replace(/<[^>]*>/g, '') // Remove HTML tags
				.replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
				.replace(/&lt;/g, '<') // Replace HTML entities
				.replace(/&gt;/g, '>')
				.replace(/&amp;/g, '&')
				.replace(/&quot;/g, '"')
				.replace(/&#39;/g, "'")
				.replace(/\s+/g, ' ') // Collapse multiple spaces
				.trim();
		}

		// Fallback to preview if no body content is available
		return message.preview || 'No content available';
	}, [message.body, message.preview]);

	// Split content into lines and wrap long lines
	const contentLines = useMemo(() => {
		const terminalWidth = stdout.columns || 80;
		const contentWidth = terminalWidth - 4; // Account for padding
		const lines = fullContent.split('\n');
		const wrappedLines: string[] = [];

		for (const line of lines) {
			if (line.length <= contentWidth) {
				wrappedLines.push(line);
			} else {
				// Wrap long lines
				let remaining = line;
				while (remaining.length > 0) {
					wrappedLines.push(remaining.slice(0, contentWidth));
					remaining = remaining.slice(contentWidth);
				}
			}
		}

		return wrappedLines;
	}, [fullContent, stdout.columns]);

	// Calculate dynamic viewport size based on terminal height
	const terminalHeight = stdout.rows || 24;
	// Reserve lines: 6 for header, 2 for CommandBar, 3 for CommandInput, 2 for scroll indicators
	const reservedLines = 13;
	const maxVisibleLines = Math.max(3, terminalHeight - reservedLines);
	const maxScrollPosition = Math.max(0, contentLines.length - maxVisibleLines);

	// Reset scroll velocity after inactivity
	useEffect(() => {
		return () => {
			if (scrollTimeoutRef.current) {
				clearTimeout(scrollTimeoutRef.current);
			}
		};
	}, []);

	const handleScroll = (direction: 'up' | 'down') => {
		// Clear existing timeout
		if (scrollTimeoutRef.current) {
			clearTimeout(scrollTimeoutRef.current);
		}

		// Calculate scroll amount (adaptive chunking)
		const baseChunkSize = 2; // Base chunk size for smooth scrolling
		const scrollAmount = Math.min(baseChunkSize * scrollVelocity, 5); // Max 5 lines at once

		if (direction === 'up') {
			setScrollPosition(Math.max(0, scrollPosition - scrollAmount));
		} else {
			setScrollPosition(
				Math.min(maxScrollPosition, scrollPosition + scrollAmount),
			);
		}

		// Increase velocity for continuous scrolling
		setScrollVelocity(previous => Math.min(previous + 0.5, 3));

		// Reset velocity after inactivity
		scrollTimeoutRef.current = setTimeout(() => {
			setScrollVelocity(1);
		}, 200);
	};

	useInput(async (input, key) => {
		// If command input is active, don't handle navigation keys
		if (isCommandInputActive) return;

		// Handle key-based navigation first
		if (key.upArrow && !key.shift) {
			handleScroll('up');
			return;
		}

		if (key.downArrow && !key.shift) {
			handleScroll('down');
			return;
		}

		if (key.upArrow && key.shift) {
			// Shift + ↑: go to top
			setScrollPosition(0);
			setScrollVelocity(1);
			return;
		}

		if (key.downArrow && key.shift) {
			// Shift + ↓: go to bottom
			setScrollPosition(maxScrollPosition);
			setScrollVelocity(1);
			return;
		}

		if (key.pageUp) {
			// Page Up: fast scroll up
			setScrollPosition(Math.max(0, scrollPosition - 10));
			setScrollVelocity(1);
			return;
		}

		if (key.pageDown) {
			// Page Down: fast scroll down
			setScrollPosition(Math.min(maxScrollPosition, scrollPosition + 10));
			setScrollVelocity(1);
			return;
		}

		if (key.escape || key.leftArrow) {
			// ESC or ← to go back
			onBack();
			return;
		}

		// Handle download number input when waiting
		if (waitingForDownloadInput) {
			if (/^\d$/.test(input)) {
				// Handle attachment number input
				const attachmentIndex = Number.parseInt(input, 10) - 1;
				if (
					message.attachments &&
					attachmentIndex >= 0 &&
					attachmentIndex < message.attachments.length
				) {
					const attachment = message.attachments[attachmentIndex];

					if (downloadService && attachment) {
						const result = await downloadService.downloadAttachment(attachment);
						if (result.success) {
							setDownloadStatus(
								`✅ Downloaded ${attachment.filename ?? ''} to ${
									result.filePath ?? ''
								}`,
							);
						} else {
							setDownloadStatus(`❌ Failed to download: ${result.error ?? ''}`);
						}
					} else {
						setDownloadStatus('❌ Download service not available');
					}

					// Clear status after 3 seconds
					setTimeout(() => {
						setDownloadStatus('');
					}, 3000);
				} else {
					setDownloadStatus('❌ Invalid attachment number');
					setTimeout(() => {
						setDownloadStatus('');
					}, 2000);
				}

				setWaitingForDownloadInput(false);
			} else if (key.escape || key.return) {
				// Cancel download mode
				setWaitingForDownloadInput(false);
				setDownloadStatus('');
			}

			return;
		}

		// Handle character input
		switch (input) {
			case 'r':
			case 'R': {
				if (onReply) onReply(message);
				break;
			}

			case 'f':
			case 'F': {
				if (onForward) onForward(message);
				break;
			}

			case 'g': {
				// Go to top (vim style)
				setScrollPosition(0);
				setScrollVelocity(1);
				break;
			}

			case 'G': {
				// Go to bottom (vim style)
				setScrollPosition(maxScrollPosition);
				setScrollVelocity(1);
				break;
			}

			case 'd':
			case 'D': {
				// 'd' to start download mode
				if (message.attachments && message.attachments.length > 0) {
					if (input === 'D' && downloadService) {
						// Download all attachments
						const results = await downloadService.downloadMultipleAttachments(
							message.attachments,
						);
						const successful = results.filter(r => r.success);
						const failed = results.filter(r => !r.success);

						if (successful.length > 0) {
							setDownloadStatus(
								`✅ Downloaded ${
									successful.length
								} file(s) to ${downloadService.getDownloadPath()}`,
							);
						}

						if (failed.length > 0) {
							setDownloadStatus(
								`⚠️ Failed to download ${failed.length} file(s)`,
							);
						}

						// Clear status after 3 seconds
						setTimeout(() => {
							setDownloadStatus('');
						}, 3000);
					} else if (input === 'd') {
						// Wait for number input
						setWaitingForDownloadInput(true);
						setDownloadStatus(
							`📥 Enter attachment number to download (1-${String(
								message.attachments.length,
							)})`,
						);
					}
				}

				break;
			}

			default: {
				break;
			}
		}
	});

	// Get visible lines based on scroll position
	const visibleLines = contentLines.slice(
		scrollPosition,
		scrollPosition + maxVisibleLines,
	);
	const canScrollUp = scrollPosition > 0;
	const canScrollDown = scrollPosition < maxScrollPosition;

	// Calculate scroll percentage for better position indication
	const scrollPercentage =
		maxScrollPosition > 0
			? Math.round((scrollPosition / maxScrollPosition) * 100)
			: 0; // 0% when no scroll (short email)

	return (
		<Box flexDirection="column" height={terminalHeight}>
			{/* Fixed Header */}
			<Box flexDirection="column">
				<Box
					borderBottom
					borderLeft={false}
					borderRight={false}
					borderStyle="single"
					borderTop={false}
					paddingBottom={0}
					paddingTop={spacing.emailViewer.headerPadding}
					paddingX={spacing.emailViewer.headerPadding}
				>
					<Box flexDirection="column" width="100%">
						<Box justifyContent="space-between">
							<Text bold color={semanticColors.email.header}>
								📧 Reading Email
							</Text>
							<Text color={colors.gray}>Press ESC to go back</Text>
						</Box>
						<Box marginTop={1}>
							<Text bold color={semanticColors.email.subject}>
								Subject: {message.subject}
							</Text>
						</Box>
						<Box flexDirection="row" marginTop={1}>
							<Text color={colors.gray}>From: </Text>
							<Text color={semanticColors.email.from}>{message.from}</Text>
							<Text color={colors.gray}> | Date: </Text>
							<Text color={semanticColors.email.date}>{message.date}</Text>
						</Box>
						{/* Progress indicator */}
						<Box flexDirection="row" marginBottom={1} marginTop={1}>
							<Text color={semanticColors.email.progressIndicator}>
								Lines {scrollPosition + 1}-
								{Math.min(
									scrollPosition + maxVisibleLines,
									contentLines.length,
								)}{' '}
								of {contentLines.length}
							</Text>
							<Text color={colors.gray}> | {scrollPercentage}%</Text>
						</Box>
					</Box>
				</Box>
			</Box>

			{/* Scrollable Content Area */}
			<Box flexDirection="column" flexGrow={1} overflow="hidden">
				{/* Scroll indicator superior */}
				{canScrollUp && (
					<Box
						justifyContent="center"
						paddingY={spacing.emailViewer.scrollIndicatorPadding}
					>
						<Text dimColor color={semanticColors.email.scrollIndicator}>
							▲ {scrollPosition} more line{scrollPosition > 1 ? 's' : ''} above
							▲
						</Text>
					</Box>
				)}

				{/* Content */}
				<Box
					flexDirection="column"
					flexGrow={1}
					paddingX={spacing.emailViewer.contentPadding}
				>
					{visibleLines.map((line, index) => (
						<Text
							// eslint-disable-next-line react/no-array-index-key
							key={scrollPosition + index}
							color={semanticColors.email.content}
						>
							{line || ' '}
						</Text>
					))}

					{/* Attachments Section */}
					{message.attachments && message.attachments.length > 0 && (
						<Box
							borderColor="gray"
							borderStyle="round"
							flexDirection="column"
							marginTop={2}
							padding={1}
						>
							<Text bold color="yellow">
								📎 Attachments ({message.attachments.length})
							</Text>
							{message.attachments.map((attachment, index) => (
								// eslint-disable-next-line react/no-array-index-key
								<Box key={index} marginTop={1}>
									<Text color="cyan">
										{index + 1}. {attachment.filename}
									</Text>
									<Text dimColor color="gray">
										{DownloadService.formatFileSize(attachment.size)} •{' '}
										{attachment.contentType}
									</Text>
								</Box>
							))}
							<Box marginTop={1}>
								<Text italic color="gray">
									Press &apos;d&apos; + number to download • &apos;D&apos; to
									download all
								</Text>
							</Box>
						</Box>
					)}

					{/* Download Status */}
					{downloadStatus && (
						<Box marginTop={1}>
							<Text
								color={
									downloadStatus.startsWith('✅')
										? 'green'
										: downloadStatus.startsWith('❌')
										? 'red'
										: 'yellow'
								}
							>
								{downloadStatus}
							</Text>
						</Box>
					)}
				</Box>

				{/* Scroll indicator inferior */}
				{canScrollDown && (
					<Box
						justifyContent="center"
						paddingY={spacing.emailViewer.scrollIndicatorPadding}
					>
						<Text dimColor color={semanticColors.email.scrollIndicator}>
							▼ {contentLines.length - scrollPosition - maxVisibleLines} more
							line
							{contentLines.length - scrollPosition - maxVisibleLines > 1
								? 's'
								: ''}{' '}
							below ▼
						</Text>
					</Box>
				)}
			</Box>

			{/* Command Input */}
			<Box flexDirection="column" width="100%">
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
			</Box>

			{/* Fixed Footer */}
			<CommandBar
				isCommandInputActive={isCommandInputActive}
				view="email"
				commands={[
					{key: '↑↓', label: 'Scroll', action: 'navigate'},
					{key: 'Shift+↑↓', label: 'Jump', action: 'select'},
					{key: 'R', label: 'Reply', action: 'primary'},
					{key: 'F', label: 'Forward', action: 'secondary'},
					...(message.attachments && message.attachments.length > 0
						? [{key: 'd/D', label: 'Download', action: 'secondary' as const}]
						: []),
					{key: 'ESC', label: 'Back', action: 'back'},
				]}
			/>
		</Box>
	);
}

export default EmailViewer;
