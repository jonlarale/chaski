import React from 'react';
import {Box, Text} from 'ink';
import {colors} from '../constants/index.js';

interface CommandItem {
	key: string;
	label: string;
	color?: string;
	action?: 'navigate' | 'select' | 'back' | 'quit' | 'primary' | 'secondary';
}

interface CommandBarProps {
	onQuit?: () => void;
	commandInputActive?: boolean;
	commands: CommandItem[];
	view: 'main' | 'email' | 'compose' | 'thread';
}

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

const CommandBar: React.FC<CommandBarProps> = ({
	commandInputActive = false,
	commands,
	view,
}) => {
	// Remove useInput from CommandBar to avoid conflicts
	// ESC handling should only be in App.tsx

	return (
		<Box>
			<Box borderStyle="single" borderTop={true} paddingX={1} width="100%">
				<Box justifyContent="center" paddingX={1} width={'100%'}>
					<Box flexDirection="row">
						{commands.map((cmd, index) => {
							// Replace Ctrl with platform-specific modifier
							const displayKey = cmd.key.replace(/Ctrl/g, modifierKey);

							return (
								<Box key={`${cmd.key}-${index}`} flexDirection="row">
									{index > 0 && <Text color={colors.darkGray}> • </Text>}
									<Text
										color={cmd.color || actionColors[cmd.action || 'navigate']}
										bold
									>
										{displayKey}
									</Text>
									<Text color={colors.white}> {cmd.label}</Text>
								</Box>
							);
						})}
						{view === 'main' && !commandInputActive && (
							<Box flexDirection="row">
								<Text color={colors.darkGray}> • </Text>
								<Text color={colors.blue} bold>
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
};

export default CommandBar;
