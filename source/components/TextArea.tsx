import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';

interface TextAreaProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	focus?: boolean;
	height?: number;
	width?: number;
	onUpArrowAtTop?: () => void;
	onDownArrowAtBottom?: () => void;
}

const TextArea: React.FC<TextAreaProps> = ({
	value,
	onChange,
	placeholder = '',
	focus = false,
	height = 10,
	width = 50,
	onUpArrowAtTop,
	onDownArrowAtBottom,
}) => {
	const [cursorPosition, setCursorPosition] = useState(value.length);
	const [scrollOffset, setScrollOffset] = useState(0);

	// Update cursor position when value changes externally
	useEffect(() => {
		setCursorPosition(value.length);
	}, [value]);

	// Split text into lines with word wrapping
	const lines = useMemo(() => {
		if (!value && placeholder) {
			return [placeholder];
		}

		const words = value.split(' ');
		const wrappedLines: string[] = [];
		let currentLine = '';

		for (const word of words) {
			// Handle newlines within words
			const wordParts = word.split('\n');
			for (let i = 0; i < wordParts.length; i++) {
				const part = wordParts[i];
				if (!part) continue;

				if (i > 0) {
					// New line
					wrappedLines.push(currentLine);
					currentLine = '';
				}

				if (currentLine.length + part.length + 1 <= width) {
					currentLine = currentLine ? `${currentLine} ${part}` : part;
				} else {
					if (currentLine) wrappedLines.push(currentLine);
					currentLine = part;
				}
			}
		}

		if (currentLine) wrappedLines.push(currentLine);
		if (wrappedLines.length === 0) wrappedLines.push('');

		return wrappedLines;
	}, [value, placeholder, width]);

	// Calculate cursor line and column
	const {cursorLine, cursorCol} = useMemo(() => {
		let pos = 0;
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			if (!line) continue;
			const lineLength = line.length;
			if (pos + lineLength >= cursorPosition) {
				return {cursorLine: i, cursorCol: cursorPosition - pos};
			}
			pos += lineLength + 1; // +1 for newline/space
		}
		const lastLine = lines[lines.length - 1];
		return {
			cursorLine: lines.length - 1,
			cursorCol: lastLine ? lastLine.length : 0,
		};
	}, [lines, cursorPosition]);

	// Adjust scroll to keep cursor visible
	useEffect(() => {
		if (cursorLine < scrollOffset) {
			setScrollOffset(cursorLine);
		} else if (cursorLine >= scrollOffset + height) {
			setScrollOffset(cursorLine - height + 1);
		}
	}, [cursorLine, scrollOffset, height]);

	useInput(
		(input, key) => {
			if (!focus) return;

			// Handle backspace - always delete character before cursor
			if (key.backspace) {
				if (cursorPosition > 0) {
					const newValue =
						value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
					onChange(newValue);
					setCursorPosition(cursorPosition - 1);
				}
				return;
			}

			// Handle delete key - context sensitive
			if (key.delete) {
				if (cursorPosition < value.length) {
					// Forward delete when cursor is not at end
					const newValue =
						value.slice(0, cursorPosition) + value.slice(cursorPosition + 1);
					onChange(newValue);
				} else if (cursorPosition > 0) {
					// Backspace behavior when cursor is at end (for terminals that send delete for backspace)
					const newValue =
						value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
					onChange(newValue);
					setCursorPosition(cursorPosition - 1);
				}
				return;
			}

			if (key.leftArrow) {
				setCursorPosition(Math.max(0, cursorPosition - 1));
			} else if (key.rightArrow) {
				setCursorPosition(Math.min(value.length, cursorPosition + 1));
			} else if (key.upArrow) {
				// Move cursor up
				if (cursorLine > 0) {
					const prevLine = lines[cursorLine - 1];
					if (prevLine) {
						const prevLineLength = prevLine.length;
						const newCol = Math.min(cursorCol, prevLineLength);
						let newPos = 0;
						for (let i = 0; i < cursorLine - 1; i++) {
							const line = lines[i];
							if (line) newPos += line.length + 1;
						}
						newPos += newCol;
						setCursorPosition(newPos);
					}
				} else if (onUpArrowAtTop) {
					// At top of textarea, let parent handle navigation
					onUpArrowAtTop();
				}
			} else if (key.downArrow) {
				// Move cursor down
				if (cursorLine < lines.length - 1) {
					const nextLine = lines[cursorLine + 1];
					if (nextLine) {
						const nextLineLength = nextLine.length;
						const newCol = Math.min(cursorCol, nextLineLength);
						let newPos = 0;
						for (let i = 0; i <= cursorLine; i++) {
							const line = lines[i];
							if (line) newPos += line.length + 1;
						}
						newPos += newCol;
						setCursorPosition(Math.min(newPos, value.length));
					}
				} else if (onDownArrowAtBottom) {
					// At bottom of textarea, let parent handle navigation
					onDownArrowAtBottom();
				}
			} else if (key.return) {
				// Insert newline
				const newValue =
					value.slice(0, cursorPosition) + '\n' + value.slice(cursorPosition);
				onChange(newValue);
				setCursorPosition(cursorPosition + 1);
				return;
			}

			// Handle character input
			if (input && !key.ctrl && !key.meta && input.length === 1) {
				const charCode = input.charCodeAt(0);

				// Check for backspace character codes (fallback for terminals that don't set key flags)
				if (charCode === 127 || charCode === 8) {
					if (cursorPosition > 0) {
						const newValue =
							value.slice(0, cursorPosition - 1) + value.slice(cursorPosition);
						onChange(newValue);
						setCursorPosition(cursorPosition - 1);
					}
					return;
				}

				// Only add printable characters (ASCII >= 32, excluding DEL)
				if (charCode >= 32 && charCode !== 127) {
					const newValue =
						value.slice(0, cursorPosition) +
						input +
						value.slice(cursorPosition);
					onChange(newValue);
					setCursorPosition(cursorPosition + 1);
				}
			}
		},
		{isActive: focus},
	);

	// Get visible lines
	const visibleLines = lines.slice(scrollOffset, scrollOffset + height);

	// Render lines with cursor
	const renderedLines = visibleLines.map((line, index) => {
		const lineIndex = scrollOffset + index;
		if (lineIndex === cursorLine) {
			// Line with cursor
			const beforeCursor = line.slice(0, cursorCol);
			const afterCursor = line.slice(cursorCol);
			const textColor = value ? 'white' : 'gray';

			return (
				<Box key={index}>
					<Text color={textColor}>{beforeCursor}</Text>
					{focus && (
						<Text backgroundColor="blue" color="blue">
							│
						</Text>
					)}
					<Text color={textColor}>{afterCursor || ' '}</Text>
				</Box>
			);
		} else {
			return (
				<Text key={index} color={value ? 'white' : 'gray'}>
					{line || ' '}
				</Text>
			);
		}
	});

	// Scroll indicators
	const canScrollUp = scrollOffset > 0;
	const canScrollDown = scrollOffset + height < lines.length;

	return (
		<Box flexDirection="column" width={width}>
			{canScrollUp && (
				<Text color="blue" dimColor>
					▲ More above ▲
				</Text>
			)}
			<Box
				flexDirection="column"
				borderStyle="round"
				borderColor={focus ? 'blue' : 'gray'}
				padding={1}
				height={height + 2}
			>
				{renderedLines}
				{/* Fill remaining space */}
				{renderedLines.length < height && <Box flexGrow={1} />}
			</Box>
			{canScrollDown && (
				<Text color="blue" dimColor>
					▼ More below ▼
				</Text>
			)}
		</Box>
	);
};

export default TextArea;
