import React, {useState, useMemo, useEffect, useRef} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import CommandBar from './CommandBar.js';
import CommandInput from './CommandInput.js';
import {colors, semanticColors, spacing} from '../constants/index.js';

interface Message {
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
}

interface EmailViewerProps {
	message: Message;
	onBack: () => void;
	onReply?: (message: Message) => void;
	onForward?: (message: Message) => void;
	commandInputActive: boolean;
	onCommandInputDeactivate: () => void;
	onCommand: (command: string) => void;
}

const EmailViewer: React.FC<EmailViewerProps> = ({
	message,
	onBack,
	onReply,
	onForward,
	commandInputActive,
	onCommandInputDeactivate,
	onCommand,
}) => {
	const [scrollPosition, setScrollPosition] = useState(0);
	const [scrollVelocity, setScrollVelocity] = useState(1);
	const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const {write, stdout} = useStdout();

	// Reset scroll position when message changes
	useEffect(() => {
		setScrollPosition(0);
		setScrollVelocity(1);
	}, [message.id]);

	// Clear screen when component mounts and unmounts
	useEffect(() => {
		// Clear screen on mount
		write('\x1b[2J\x1b[H');

		return () => {
			// Clear screen on unmount
			write('\x1b[2J\x1b[H');
		};
	}, [write]);

	// Get the full email content from the body
	const fullContent = useMemo(() => {
		if (message.body?.text) {
			// Use the text content if available
			return message.body.text;
		} else if (message.body?.html) {
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
		} else {
			// Fallback to preview if no body content is available
			return message.preview || 'No content available';
		}
	}, [message.body, message.preview]);

	// Split content into lines and wrap long lines
	const contentLines = useMemo(() => {
		const terminalWidth = stdout.columns || 80;
		const contentWidth = terminalWidth - 4; // Account for padding
		const lines = fullContent.split('\n');
		const wrappedLines: string[] = [];

		lines.forEach(line => {
			if (line.length <= contentWidth) {
				wrappedLines.push(line);
			} else {
				// Wrap long lines
				let remaining = line;
				while (remaining.length > 0) {
					wrappedLines.push(remaining.substring(0, contentWidth));
					remaining = remaining.substring(contentWidth);
				}
			}
		});

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
		setScrollVelocity(prev => Math.min(prev + 0.5, 3));

		// Reset velocity after inactivity
		scrollTimeoutRef.current = setTimeout(() => {
			setScrollVelocity(1);
		}, 200);
	};

	useInput((input, key) => {
		// If command input is active, don't handle navigation keys
		if (commandInputActive) return;

		if (key.upArrow && !key.shift) {
			handleScroll('up');
		} else if (key.downArrow && !key.shift) {
			handleScroll('down');
		} else if (key.upArrow && key.shift) {
			// Shift + ↑: ir al inicio
			setScrollPosition(0);
			setScrollVelocity(1);
		} else if (key.downArrow && key.shift) {
			// Shift + ↓: ir al final
			setScrollPosition(maxScrollPosition);
			setScrollVelocity(1);
		} else if (key.pageUp) {
			// Page Up: fast scroll up
			setScrollPosition(Math.max(0, scrollPosition - 10));
			setScrollVelocity(1);
		} else if (key.pageDown) {
			// Page Down: fast scroll down
			setScrollPosition(Math.min(maxScrollPosition, scrollPosition + 10));
			setScrollVelocity(1);
		} else if (key.escape || key.leftArrow) {
			// ESC or ← to go back
			onBack();
		} else if ((input === 'r' || input === 'R') && onReply) {
			// R to reply
			onReply(message);
		} else if ((input === 'f' || input === 'F') && onForward) {
			// F to forward
			onForward(message);
		} else if (input === 'g') {
			// g to go to top (vim style)
			setScrollPosition(0);
			setScrollVelocity(1);
		} else if (input === 'G') {
			// G to go to bottom (vim style)
			setScrollPosition(maxScrollPosition);
			setScrollVelocity(1);
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
					borderStyle="single"
					borderBottom={true}
					borderTop={false}
					borderLeft={false}
					borderRight={false}
					paddingX={spacing.emailViewer.headerPadding}
					paddingTop={spacing.emailViewer.headerPadding}
					paddingBottom={0}
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
						<Box marginTop={1} flexDirection="row">
							<Text color={colors.gray}>From: </Text>
							<Text color={semanticColors.email.from}>{message.from}</Text>
							<Text color={colors.gray}> | Date: </Text>
							<Text color={semanticColors.email.date}>{message.date}</Text>
						</Box>
						{/* Progress indicator */}
						<Box marginTop={1} marginBottom={1} flexDirection="row">
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
						<Text color={semanticColors.email.scrollIndicator} dimColor>
							▲ {scrollPosition} more line{scrollPosition > 1 ? 's' : ''} above
							▲
						</Text>
					</Box>
				)}

				{/* Content */}
				<Box
					flexDirection="column"
					paddingX={spacing.emailViewer.contentPadding}
					flexGrow={1}
				>
					{visibleLines.map((line, index) => (
						<Text
							key={scrollPosition + index}
							color={semanticColors.email.content}
						>
							{line || ' '}
						</Text>
					))}
				</Box>

				{/* Scroll indicator inferior */}
				{canScrollDown && (
					<Box
						justifyContent="center"
						paddingY={spacing.emailViewer.scrollIndicatorPadding}
					>
						<Text color={semanticColors.email.scrollIndicator} dimColor>
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
				<CommandInput
					isActive={commandInputActive}
					onDeactivate={onCommandInputDeactivate}
					onCommand={onCommand}
				/>
			</Box>

			{/* Fixed Footer */}
			<CommandBar
				onQuit={onBack}
				view="email"
				commandInputActive={commandInputActive}
				commands={[
					{key: '↑↓', label: 'Scroll', action: 'navigate'},
					{key: 'Shift+↑↓', label: 'Jump', action: 'select'},
					{key: 'R', label: 'Reply', action: 'primary'},
					{key: 'F', label: 'Forward', action: 'secondary'},
					{key: 'ESC', label: 'Back', action: 'back'},
				]}
			/>
		</Box>
	);
};

export default EmailViewer;
