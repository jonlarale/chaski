import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import {colors, semanticColors, spacing} from '../constants/index.js';
import TextInput from './TextInput.js';

type CommandInputProps = {
	readonly isActive: boolean;
	readonly onDeactivate: () => void;
	readonly onCommand: (command: string) => void;
};

type Command = {
	cmd: string;
	desc: string;
};

function CommandInput({isActive, onDeactivate, onCommand}: CommandInputProps) {
	const [inputValue, setInputValue] = useState('');
	const [showCommands, setShowCommands] = useState(false);
	const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);
	const [filteredCommands, setFilteredCommands] = useState<Command[]>([]);

	// Available commands
	const availableCommands: Command[] = [
		{cmd: '/add-account', desc: 'Add a new email account'},
		{cmd: '/edit-account', desc: 'Edit an existing email account'},
		{cmd: '/remove-account', desc: 'Remove an email account'},
		{cmd: '/settings', desc: 'Open settings'},
		{cmd: '/refresh', desc: 'Refresh current folder'},
		{cmd: '/refresh-all', desc: 'Refresh all folders'},
		{cmd: '/refresh-inbox', desc: 'Quick refresh inbox only'},
		{cmd: '/sync', desc: 'Alias for /refresh'},
		{cmd: '/r', desc: 'Short alias for /refresh'},
		{cmd: '/auto-refresh', desc: 'Enable/disable auto-refresh'},
		{
			cmd: '/auto-refresh-interval',
			desc: 'Set auto-refresh interval in minutes',
		},
		{cmd: '/cache-status', desc: 'Show cache statistics'},
		{cmd: '/cache-clear', desc: 'Clear all cached data'},
		{cmd: '/search', desc: 'Search emails'},
		{cmd: '/compose', desc: 'Compose new email'},
		{cmd: '/clear', desc: 'Exit command input'},
		{cmd: '/help', desc: 'Show all commands'},
		{cmd: '/assistant-clear', desc: 'Clear assistant conversation'},
		{cmd: '/quit', desc: 'Exit the application'},
	];

	// Filter commands based on input
	useEffect(() => {
		if (inputValue.startsWith('/')) {
			const filtered = availableCommands.filter(c =>
				c.cmd.toLowerCase().startsWith(inputValue.toLowerCase()),
			);
			setFilteredCommands(filtered);
			setShowCommands(filtered.length > 0);
			setSelectedCommandIndex(0);
		} else {
			setShowCommands(false);
			setFilteredCommands([]);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [inputValue]);

	// Handle navigation keys when dropdown is shown
	const handleKeyPress = React.useCallback(
		(_input: string, key: any) => {
			// Only process if active
			if (!isActive) return;

			// Handle escape
			if (key.escape) {
				setInputValue('');
				setShowCommands(false);
				onDeactivate();
				return;
			}

			// Only handle navigation keys when dropdown is shown
			if (showCommands && filteredCommands.length > 0) {
				if (key.upArrow) {
					setSelectedCommandIndex(previous =>
						previous > 0 ? previous - 1 : filteredCommands.length - 1,
					);
					return;
				}

				if (key.downArrow) {
					setSelectedCommandIndex(previous =>
						previous < filteredCommands.length - 1 ? previous + 1 : 0,
					);
					return;
				}

				if (key.return) {
					// Let TextInput handle the return key
				}
			}
		},
		[isActive, showCommands, filteredCommands, onDeactivate],
	);

	useInput(handleKeyPress, {isActive});

	const handleSubmit = () => {
		// If dropdown is shown and we have a selected command, use it
		if (showCommands && filteredCommands.length > 0) {
			const selectedCommand = filteredCommands[selectedCommandIndex];
			if (selectedCommand) {
				if (selectedCommand.cmd.toLowerCase() === '/clear') {
					setInputValue('');
					setShowCommands(false);
					onDeactivate();
				} else {
					onCommand(selectedCommand.cmd);
					setInputValue('');
					setShowCommands(false);
					onDeactivate();
				}
			}
		} else if (inputValue.trim()) {
			// Otherwise, execute the typed command
			if (inputValue.trim().toLowerCase() === '/clear') {
				setInputValue('');
				onDeactivate();
			} else {
				onCommand(inputValue.trim());
				setInputValue('');
				onDeactivate();
			}
		}
	};

	return (
		<Box marginBottom={spacing.commandInput.margin} width="100%">
			<Box
				borderColor={
					isActive
						? semanticColors.command.borderActive
						: semanticColors.command.borderInactive
				}
				borderStyle="single"
				flexDirection="column"
				padding={0}
				width="100%"
			>
				{/* Command dropdown */}
				{showCommands && isActive && filteredCommands.length > 0 && (
					<Box
						flexDirection="column"
						paddingBottom={0}
						paddingTop={spacing.commandInput.dropdownPadding}
						paddingX={spacing.commandInput.dropdownPadding}
						width="100%"
					>
						{filteredCommands.map((cmd, index) => (
							<Box key={cmd.cmd} marginBottom={0} width="100%">
								<Text
									backgroundColor={
										index === selectedCommandIndex
											? semanticColors.command.selected
											: undefined
									}
									bold={index === selectedCommandIndex}
									color={
										index === selectedCommandIndex ? colors.white : colors.gray
									}
								>
									{index === selectedCommandIndex ? '▶ ' : '  '}
									{cmd.cmd}
								</Text>
								<Text color={colors.gray}> - {cmd.desc}</Text>
							</Box>
						))}
						<Box
							marginBottom={spacing.marginSm}
							marginTop={spacing.marginSm}
							width="100%"
						>
							<Text color={colors.darkGray}>
								────────────────────────────────────────
							</Text>
						</Box>
					</Box>
				)}

				{/* Input box */}
				<Box paddingX={spacing.commandInput.padding} width="100%">
					<Box flexDirection="row" width="100%">
						<Text
							bold
							color={isActive ? semanticColors.command.prompt : colors.gray}
						>
							{'> '}
						</Text>
						{isActive ? (
							<Box flexGrow={1}>
								<TextInput
									focus
									placeholder="Ask about your mail or type / for commands..."
									value={inputValue}
									onChange={setInputValue}
									onSubmit={handleSubmit}
								/>
							</Box>
						) : (
							<Text color={semanticColors.command.placeholder}>
								Press Tab to ask the assistant or run commands
							</Text>
						)}
					</Box>
				</Box>
			</Box>
		</Box>
	);
}

export default CommandInput;
