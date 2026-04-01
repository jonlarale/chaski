import process from 'node:process';
import React from 'react';
import {Box, Text} from 'ink';
import {colors} from '../constants/index.js';

type CommandItem = {
	key: string;
	label: string;
	color?: string;
	action?: 'navigate' | 'select' | 'back' | 'quit' | 'primary' | 'secondary';
};

type CommandBarProps = {
	readonly isCommandInputActive?: boolean;
	readonly commands: CommandItem[];
	readonly view: 'main' | 'email' | 'compose' | 'thread';
};

// Detect platform for modifier key display
const isMac = process.platform === 'darwin';
const modifierKey = isMac ? '⌘' : 'Ctrl';

// Standardized color scheme for actions
const actionColors: Record<string, string> = {
	navigate: colors.blue,
	select: colors.cyan,
	back: colors.red,
	quit: colors.red,
	primary: colors.green,
	secondary: colors.magenta,
};

function CommandBar({
	isCommandInputActive = false,
	commands,
	view,
}: CommandBarProps) {
	// Remove useInput from CommandBar to avoid conflicts
	// ESC handling should only be in App.tsx

	return (
		<Box>
			<Box borderTop borderStyle="single" paddingX={1} width="100%">
				<Box justifyContent="center" paddingX={1} width="100%">
					<Box flexDirection="row">
						{commands.map((cmd, index) => {
							// Replace Ctrl with platform-specific modifier
							const displayKey = cmd.key.replace(/Ctrl/g, modifierKey);

							return (
								<Box key={cmd.key} flexDirection="row">
									{index > 0 && <Text color={colors.darkGray}> • </Text>}
									<Text
										bold
										color={cmd.color ?? actionColors[cmd.action ?? 'navigate']}
									>
										{displayKey}
									</Text>
									<Text color={colors.white}> {cmd.label}</Text>
								</Box>
							);
						})}
						{view === 'main' && !isCommandInputActive && (
							<Box flexDirection="row">
								<Text color={colors.darkGray}> • </Text>
								<Text bold color={colors.blue}>
									Tab
								</Text>
								<Text color={colors.white}> Commands</Text>
							</Box>
						)}
					</Box>
				</Box>
			</Box>
			<Box height={1} />
		</Box>
	);
}

export default CommandBar;
