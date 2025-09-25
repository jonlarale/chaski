import React from 'react';
import {Box, Text} from 'ink';
import {AssistantMessage, AssistantStatus} from '../types/assistant.js';
import {colors, spacing} from '../constants/index.js';

interface AssistantPanelProps {
	messages: AssistantMessage[];
	status: AssistantStatus;
	error?: string | null;
}

const statusLabel = (status: AssistantStatus, error?: string | null) => {
	switch (status) {
		case 'thinking':
			return {color: colors.yellow, text: 'Contacting assistant…'};
		case 'error':
			return {
				color: colors.error,
				text: error || 'Assistant could not complete the request.',
			};
		default:
			return {color: colors.textSecondary, text: 'Ready'};
	}
};

const roleLabel = {
	user: {prefix: 'You', color: colors.cyan},
	assistant: {prefix: 'Chaski AI', color: colors.green},
} as const;

const AssistantPanel: React.FC<AssistantPanelProps> = ({
	messages,
	status,
	error,
}) => {
	const recentMessages = messages.slice(-4);
	const {color: statusColor, text: statusText} = statusLabel(status, error);

	return (
		<Box
			flexDirection="column"
			width="100%"
			borderStyle="single"
			borderColor={
				status === 'error'
					? colors.error
					: status === 'thinking'
					? colors.yellow
					: colors.borderInactive
			}
			padding={1}
			marginBottom={spacing.commandInput.margin}
		>
			<Box justifyContent="space-between" width="100%">
				<Text color={colors.cyan} bold>
					🤖 Mail Assistant
				</Text>
				<Text color={statusColor}>{statusText}</Text>
			</Box>

			<Box flexDirection="column" marginTop={spacing.marginSM}>
				{recentMessages.length === 0 ? (
					<Text color={colors.textPlaceholder}>
						Type a question without a leading "/" to ask about your mail.
					</Text>
				) : (
					recentMessages.map(message => {
						const role = roleLabel[message.role];
						return (
							<Box key={message.id} flexDirection="column" marginBottom={spacing.marginXS}>
								<Text color={role.color} bold>
									{role.prefix}
								</Text>
								<Text wrap="wrap" color={colors.textPrimary}>
									{message.content}
								</Text>
							</Box>
						);
					})
				)}
			</Box>

			<Text color={colors.textSecondary} dimColor>
				Tip: Use /assistant-clear to reset the conversation.
			</Text>
		</Box>
	);
};

export default AssistantPanel;
