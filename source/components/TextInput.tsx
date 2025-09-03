import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';

interface TextInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	focus?: boolean;
	onSubmit?: () => void;
	width?: number;
}

const TextInput: React.FC<TextInputProps> = ({
	value,
	onChange,
	placeholder = '',
	focus = false,
	onSubmit,
	width,
}) => {
	const [cursorPosition, setCursorPosition] = useState(value.length);

	// Update cursor position when value changes externally
	useEffect(() => {
		setCursorPosition(value.length);
	}, [value]);

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

			// Handle arrow keys
			if (key.leftArrow) {
				setCursorPosition(Math.max(0, cursorPosition - 1));
				return;
			}
			if (key.rightArrow) {
				setCursorPosition(Math.min(value.length, cursorPosition + 1));
				return;
			}

			// Handle enter/return
			if (key.return && onSubmit) {
				onSubmit();
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

	// Display value with cursor
	const beforeCursor = value.slice(0, cursorPosition);
	const afterCursor = value.slice(cursorPosition);

	// If empty, show placeholder
	if (!value && placeholder) {
		return (
			<Box width={width}>
				{focus && cursorPosition === 0 && (
					<Text backgroundColor="blue" color="blue">
						│
					</Text>
				)}
				<Text color="gray">{placeholder}</Text>
			</Box>
		);
	}

	return (
		<Box width={width}>
			<Text color="white">{beforeCursor}</Text>
			{focus && (
				<Text backgroundColor="blue" color="blue">
					│
				</Text>
			)}
			<Text color="white">{afterCursor}</Text>
		</Box>
	);
};

export default TextInput;
