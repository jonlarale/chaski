import React from 'react';
import {Box, Text} from 'ink';
import type {AssistantMessage, AssistantStatus} from '../types/assistant.js';
import {colors, spacing} from '../constants/index.js';

type AssistantPanelProps = {
	readonly messages: AssistantMessage[];
	readonly status: AssistantStatus;
	readonly error?: string | undefined;
};

const statusLabel = (status: AssistantStatus, error?: string | undefined) => {
	switch (status) {
		case 'thinking': {
			return {color: colors.yellow, text: 'Contacting assistant…'};
		}

		case 'error': {
			return {
				color: colors.error,
				text: error ?? 'Assistant could not complete the request.',
			};
		}

		default: {
			return {color: colors.textSecondary, text: 'Ready'};
		}
	}
};

const roleLabel = {
	user: {prefix: 'You', color: colors.cyan},
	assistant: {prefix: 'Chaski AI', color: colors.green},
} as const;

function AssistantPanel({messages, status, error}: AssistantPanelProps) {
	const recentMessages = messages.slice(-4);
	const {color: statusColor, text: statusText} = statusLabel(status, error);

	return (
		<Box
			borderColor={
				status === 'error'
					? colors.error
					: status === 'thinking'
					? colors.yellow
					: colors.borderInactive
			}
			borderStyle="single"
			flexDirection="column"
			marginBottom={spacing.commandInput.margin}
			padding={1}
			width="100%"
		>
			<Box justifyContent="space-between" width="100%">
				<Text bold color={colors.cyan}>
					🤖 Chaski AI Assistant
				</Text>
				<Text color={statusColor}>{statusText}</Text>
			</Box>

			<Box flexDirection="column" marginTop={spacing.marginSm}>
				{recentMessages.length === 0 ? (
					<Text color={colors.textPlaceholder}>
						Type a question without a leading &quot;/&quot; to ask about your
						mail.
					</Text>
				) : (
					recentMessages.map(message => {
						const role = roleLabel[message.role];
						return (
							<Box
								key={message.id}
								flexDirection="column"
								marginBottom={spacing.marginXs}
							>
								<Text bold color={role.color}>
									{role.prefix}
								</Text>
								<Text color={colors.textPrimary} wrap="wrap">
									{message.content}
								</Text>
							</Box>
						);
					})
				)}
			</Box>

			<Text dimColor color={colors.textSecondary}>
				Tip: Use /assistant-clear to reset the conversation.
			</Text>
		</Box>
	);
}

export default AssistantPanel;
