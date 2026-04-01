// Src/index.tsx
import type {Buffer} from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import React, {useState, useEffect} from 'react';
import {Box, useApp, useInput, useStdout} from 'ink';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import FolderList from './components/FolderList.js';
import MessageList from './components/MessageList.js';
import CommandBar from './components/CommandBar.js';
import AssistantPanel from './components/AssistantPanel.js';
import EmailViewer from './components/EmailViewer.js';
import ThreadViewer from './components/ThreadViewer.js';
import EmailComposer from './components/EmailComposer.js';
import CommandInput from './components/CommandInput.js';
import {AddAccountDialog} from './components/AddAccountDialog.js';
import {EditAccountView} from './components/EditAccountView.js';
import {RemoveAccountDialog} from './components/RemoveAccountDialog.js';
import {SettingsDialog} from './components/SettingsDialog.js';
import {EmailService} from './services/emailService.js';
import {SettingsService} from './services/settingsService.js';
import {CacheService} from './services/cacheService.js';
import {DownloadService} from './services/downloadService.js';
import AssistantService from './services/assistantService.js';
import type {AssistantMessage, AssistantStatus} from './types/assistant.js';
import type {EmailAccount, EmailMessage} from './types/email.js';
import type {RefreshStatus} from './types/refresh.js';
import {spacing} from './constants/index.js';

// Debug logging function
const debugLog = (component: string, message: string, data?: unknown) => {
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] ${component}: ${message}${
		data ? ` ${JSON.stringify(data)}` : ''
	}\n`;
	try {
		fs.appendFileSync(path.join(process.cwd(), 'debug.log'), logEntry);
	} catch {
		// Fail silently if we can't write to log
	}
};

type FocusedComponent = 'folders' | 'messages';
type ViewMode =
	| 'main'
	| 'email'
	| 'thread'
	| 'compose'
	| 'addAccount'
	| 'editAccount'
	| 'removeAccount'
	| 'settings';

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
	attachments?: Array<{
		filename: string;
		contentType: string;
		size: number;
		contentId?: string;
		content?: Buffer;
	}>;
	_original?: EmailMessage; // Original EmailMessage data
};

function App() {
	const [selectedFolder, setSelectedFolder] = useState('INBOX');
	const [selectedAccount, setSelectedAccount] = useState<string | undefined>(
		undefined,
	);
	const [focusedComponent, setFocusedComponent] =
		useState<FocusedComponent>('folders');
	const [viewMode, setViewMode] = useState<ViewMode>('main');
	const [openedEmail, setOpenedEmail] = useState<Message | undefined>(
		undefined,
	);
	const [openedThread, setOpenedThread] = useState<Message | undefined>(
		undefined,
	);
	const [folderExpanded, setFolderExpanded] = useState(false); // To track if a folder is expanded
	const [composeMode, setComposeMode] = useState<
		'compose' | 'reply' | 'forward'
	>('compose');
	const [replyToMessage, setReplyToMessage] = useState<Message | undefined>(
		undefined,
	);
	const [lastUsedAccount, setLastUsedAccount] =
		useState<string>('example@gmail.com');
	const [commandInputActive, setCommandInputActive] = useState(false);
	const [emailService, setEmailService] = useState(() => new EmailService());
	void setEmailService;
	const [settingsService, setSettingsService] = useState(
		() => new SettingsService(),
	);
	void setSettingsService;
	const [cacheService, setCacheService] = useState(() => new CacheService());
	void setCacheService;
	const [downloadService, setDownloadService] = useState(
		() => new DownloadService(),
	);
	void setDownloadService;
	const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
	const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({
		isRefreshing: false,
	});
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const [assistantService, setAssistantService] = useState(
		() => new AssistantService(),
	);
	void setAssistantService;
	const [assistantMessages, setAssistantMessages] = useState<
		AssistantMessage[]
	>([]);
	const [assistantStatus, setAssistantStatus] =
		useState<AssistantStatus>('idle');
	const [assistantError, setAssistantError] = useState<string | undefined>(
		undefined,
	);
	const app = useApp();
	const {stdout} = useStdout();

	debugLog('App.tsx', 'useApp hook result', {
		hasExit: Boolean(app.exit),
		app: Object.keys(app ?? {}),
	});

	const onQuit = () => {
		debugLog('App.tsx onQuit', 'onQuit called, forcing immediate exit');
		// Just exit immediately - Ink's app.exit() seems to not be working
		process.exit(0); // eslint-disable-line unicorn/no-process-exit
	};

	// Calculate responsive folder width (30% with 25 char minimum)
	const terminalWidth = stdout.columns ?? 80;
	const folderWidth = Math.max(
		Math.floor(terminalWidth * spacing.folder.widthPercent),
		spacing.folder.minWidth,
	);

	// Load email accounts on mount
	useEffect(() => {
		emailService.getAccounts().then(setEmailAccounts).catch(console.error);
	}, [emailService]);

	// Get available account emails
	const availableAccounts = emailAccounts.map(account => account.email);

	const createAssistantMessage = (
		role: 'user' | 'assistant',
		content: string,
	): AssistantMessage => ({
		id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		role,
		content,
		createdAt: new Date(),
	});

	const gatherAssistantContext = async () => {
		const openedEmailOriginal = openedEmail?._original;
		const openedThreadOriginal = openedThread?._original;
		const folderCandidate =
			openedEmailOriginal?.folder ??
			openedThreadOriginal?.folder ??
			selectedFolder ??
			'INBOX';
		const accountIdFromMessage =
			openedEmailOriginal?.accountId ?? openedThreadOriginal?.accountId;
		const accountFromMessage = accountIdFromMessage
			? emailAccounts.find(acc => acc.id === accountIdFromMessage)
			: undefined;
		const accountFromSelection = selectedAccount
			? emailAccounts.find(acc => acc.email === selectedAccount)
			: undefined;
		const account =
			accountFromMessage ?? accountFromSelection ?? emailAccounts[0];

		if (!account) {
			return assistantService.buildContextSnapshot([], {
				account: selectedAccount,
				folder: folderCandidate,
			});
		}

		let contextEmails: EmailMessage[] = [];

		try {
			contextEmails = await cacheService.getCachedMessages(
				folderCandidate,
				account.id,
				20,
				0,
			);
		} catch (error: unknown) {
			debugLog('App.tsx', 'Assistant cache lookup failed', {
				error: error instanceof Error ? error.message : String(error),
			});
		}

		if (contextEmails.length === 0) {
			try {
				contextEmails = await emailService.getMessages(
					account.id,
					folderCandidate,
					20,
				);
			} catch (error: unknown) {
				debugLog('App.tsx', 'Assistant message fetch failed', {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const pinnedMessage = openedEmailOriginal ?? openedThreadOriginal;
		if (pinnedMessage) {
			contextEmails = [
				pinnedMessage,
				...contextEmails.filter(email => email.id !== pinnedMessage.id),
			];
		}

		return assistantService.buildContextSnapshot(contextEmails, {
			account: account.email,
			folder: folderCandidate,
		});
	};

	const handleAssistantQuery = async (prompt: string) => {
		const question = prompt.trim();
		if (!question) return;

		if (assistantStatus === 'thinking') {
			console.log('🤖 Assistant is still responding. Please wait.');
			return;
		}

		const userMessage = createAssistantMessage('user', question);
		setAssistantMessages(previous => [...previous, userMessage]);
		setAssistantError(undefined);

		if (!assistantService.isEnabled()) {
			const warning = createAssistantMessage(
				'assistant',
				'Set OPENAI_API_KEY in your .env file to enable the assistant.',
			);
			setAssistantMessages(previous => [...previous, warning]);
			setAssistantStatus('error');
			setAssistantError('OPENAI_API_KEY is not configured.');
			return;
		}

		setAssistantStatus('thinking');

		try {
			const context = await gatherAssistantContext();
			const history = [...assistantMessages, userMessage];
			const response = await assistantService.createResponse({
				prompt: question,
				history,
				context,
			});
			const assistantMessage = createAssistantMessage(
				'assistant',
				response.reply,
			);
			setAssistantMessages(previous => [...previous, assistantMessage]);
			setAssistantStatus('idle');
			setAssistantError(undefined);
		} catch (error: unknown) {
			const message =
				error instanceof Error
					? error.message
					: 'Unable to retrieve a response from the assistant.';
			debugLog('App.tsx', 'Assistant query failed', {
				error: error instanceof Error ? error.message : String(error),
			});
			const fallback = createAssistantMessage('assistant', `⚠️ ${message}`);
			setAssistantMessages(previous => [...previous, fallback]);
			setAssistantStatus('error');
			setAssistantError(message);
		}
	};

	// Handle navigation between components
	useInput((input, key) => {
		// DEBUG: Log all key presses to see what's happening
		debugLog('App.tsx useInput', 'Key pressed', {
			input,
			key: {
				escape: key.escape,
				tab: key.tab,
				leftArrow: key.leftArrow,
				rightArrow: key.rightArrow,
			},
			commandInputActive,
			viewMode,
		});

		// Ctrl+C to exit from anywhere
		if (key.ctrl && input === 'c') {
			debugLog('App.tsx', 'Ctrl+C detected, calling onQuit()');
			onQuit();
			return;
		}

		// ESC to exit - only when in main view and command input is not active
		if (key.escape && viewMode === 'main' && !commandInputActive) {
			debugLog('App.tsx', 'ESC detected in main view, calling onQuit()');
			onQuit();
			return;
		}

		// Tab key activates command input (works in all views)
		if (key.tab) {
			debugLog('App.tsx', 'Tab pressed, activating command input');
			setCommandInputActive(true);
			return;
		}

		// If command input is active, let it handle all keys including ESC
		if (commandInputActive) {
			debugLog('App.tsx', 'Command input is active, skipping key handling');
			return;
		}

		// If not in main view, let child components handle navigation including ESC
		if (viewMode !== 'main') {
			debugLog(
				'App.tsx',
				`Not in main view (${viewMode}), skipping key handling`,
			);
			return;
		}

		// If command input is active, don't handle anything else here
		if (commandInputActive) return;

		// If an email or thread is open, don't process global navigation
		if (viewMode !== 'main') return;

		// Handle compose shortcut
		if (input === 'c' || input === 'C') {
			setComposeMode('compose');
			setReplyToMessage(undefined);
			setViewMode('compose');
			return;
		}

		// Only handle horizontal navigation between components when:
		// 1. We're in folders and have a selected account (to go to messages)
		// 2. We're in messages (to go back to folders)
		// → only advances if we're in folders AND have a selected account
		if (key.rightArrow && focusedComponent === 'folders' && selectedAccount) {
			setFocusedComponent('messages');
		}

		// ← goes back from messages to folders
		if (key.leftArrow && focusedComponent === 'messages') {
			setFocusedComponent('folders');
			// Clear account selection to return to accounts level
			setSelectedAccount(undefined);
			// Keep folderExpanded as true to show selection message
		}
	});

	const handleFolderExpand = (expanded: boolean) => {
		setFolderExpanded(expanded);
		// If folder is collapsed, clear selected account
		if (!expanded) {
			setSelectedAccount(undefined);
		}
	};

	const handleFolderSelect = (folder: string, account?: string) => {
		setSelectedFolder(folder);
		setSelectedAccount(account);
		// Only change focus to messages if a specific account was selected
		if (account) {
			setFocusedComponent('messages');
			// Remember the last used account for composing
			setLastUsedAccount(account);
		}
	};

	const handleEmailOpen = async (message: Message) => {
		// Mark the message as read when opened
		const updatedMessage = {...message, read: true};
		setOpenedEmail(updatedMessage);
		setViewMode('email');

		// If the message has the original email data, mark it as read in the email service
		if (message._original && selectedAccount) {
			const originalMessage = message._original;
			const account = emailAccounts.find(acc => acc.email === selectedAccount);

			if (account && originalMessage.uid) {
				try {
					// Mark as read in the email service (this will update IMAP)
					await emailService.markAsRead(
						account.id,
						selectedFolder,
						originalMessage.uid,
					);

					// Update the cache to reflect the read status
					const updatedFlags = [...(originalMessage.flags ?? [])];
					if (!updatedFlags.includes('\\Seen')) {
						updatedFlags.push('\\Seen');
					}

					await cacheService.updateMessageFlags(
						originalMessage.id,
						selectedFolder,
						account.id,
						updatedFlags,
					);
				} catch (error: unknown) {
					console.error('Failed to mark message as read:', error);
				}
			}
		}
	};

	const handleThreadOpen = (message: Message) => {
		setOpenedThread(message);
		setViewMode('thread');
	};

	const handleBackToMain = () => {
		setOpenedEmail(undefined);
		setOpenedThread(undefined);
		setViewMode('main');
	};

	const handleComposeEmail = (email: any) => {
		// In a real app, this would send the email
		// For now, we'll just go back to main view
		console.log('Sending email from:', email.from);
		console.log('To:', email.to);
		if (email.cc) {
			console.log('CC:', email.cc);
		}

		console.log('Subject:', email.subject);
		// Remember the account used for sending
		setLastUsedAccount(email.from);
		setViewMode('main');
		setComposeMode('compose');
		setReplyToMessage(undefined);
	};

	const handleComposeCancel = () => {
		setViewMode('main');
		setComposeMode('compose');
		setReplyToMessage(undefined);
	};

	const handleReply = (message: Message) => {
		setComposeMode('reply');
		setReplyToMessage(message);
		// For replies, try to use the account that received the email
		// This is a simple heuristic - in a real app, you'd check which account received it
		if (selectedAccount && availableAccounts.includes(selectedAccount)) {
			setLastUsedAccount(selectedAccount);
		}

		setViewMode('compose');
	};

	const handleForward = (message: Message) => {
		setComposeMode('forward');
		setReplyToMessage(message);
		// For forwards, use the same logic as replies
		if (selectedAccount && availableAccounts.includes(selectedAccount)) {
			setLastUsedAccount(selectedAccount);
		}

		setViewMode('compose');
	};

	const handleRefresh = async (scope: 'current' | 'all' | 'inbox') => {
		if (refreshStatus.isRefreshing) {
			console.log('Already refreshing...');
			return;
		}

		setRefreshStatus({
			isRefreshing: true,
			message: `🔄 Refreshing ${
				scope === 'current'
					? 'current folder'
					: scope === 'inbox'
					? 'inbox'
					: 'all folders'
			}...`,
		});

		try {
			if (scope === 'current' && selectedAccount && selectedFolder) {
				// Refresh current folder
				const account = emailAccounts.find(
					acc => acc.email === selectedAccount,
				);
				if (account) {
					// Get the current cached messages to check what we already have
					const cachedMessages = await cacheService.getCachedMessages(
						selectedFolder,
						account.id,
						10_000, // Get max 10000 cached messages to check UIDs
					);

					// Get the total messages in the folder first
					const folderStatus = await emailService.getFolderStatus(
						account.id,
						selectedFolder,
					);

					const {total: totalMessages, maxSequence} = folderStatus;
					let allMessages: EmailMessage[] = [];

					// Smart refresh strategy:
					// 1. Check recent messages for any new ones
					// 2. If this is the first load or cache is empty, do a full load
					const isInitialLoad = cachedMessages.length === 0;

					if (totalMessages > 0) {
						if (isInitialLoad) {
							// Initial load - fetch progressively
							const firstBatchSize = 50;
							const regularBatchSize = 500;
							// Use maxSequence instead of totalMessages to avoid missing messages
							// when there are deleted messages with gaps in sequence numbers
							const firstEndSeq = maxSequence;
							const firstStartSeq = Math.max(
								1,
								firstEndSeq - firstBatchSize + 1,
							);
							const firstRange = `${firstStartSeq}:${firstEndSeq}`;

							setRefreshStatus({
								isRefreshing: true,
								message: `🔄 Loading recent messages...`,
							});

							const firstBatch = await emailService.getMessages(
								account.id,
								selectedFolder,
								firstBatchSize,
								firstRange,
							);

							allMessages = firstBatch;

							// Immediately update cache with first batch so UI can show them
							await cacheService.updateMessages(
								allMessages,
								selectedFolder,
								account.id,
							);

							// Trigger UI update to show first messages
							setRefreshTrigger(previous => previous + 1);

							// Now fetch the rest in batches
							const remainingEnd = firstStartSeq - 1;
							if (remainingEnd > 0) {
								setRefreshStatus({
									isRefreshing: true,
									message: `🔄 Loading older messages... ${allMessages.length}/${totalMessages}`,
								});

								for (
									let endSeq = remainingEnd;
									endSeq > 0;
									endSeq -= regularBatchSize
								) {
									const startSeq = Math.max(1, endSeq - regularBatchSize + 1);
									const sequenceRange = `${startSeq}:${endSeq}`;

									// eslint-disable-next-line no-await-in-loop
									const batchMessages = await emailService.getMessages(
										account.id,
										selectedFolder,
										regularBatchSize,
										sequenceRange,
									);

									allMessages = [...allMessages, ...batchMessages];

									// Update status to show progress
									setRefreshStatus({
										isRefreshing: true,
										message: `🔄 Loading messages... ${allMessages.length}/${totalMessages}`,
									});

									// Periodically update cache
									if (allMessages.length % 1000 === 0) {
										// eslint-disable-next-line no-await-in-loop
										await cacheService.updateMessages(
											allMessages,
											selectedFolder,
											account.id,
										);
									}
								}
							}
						} else {
							// Regular refresh - only fetch new messages
							const messagesToCheck = 200; // Check last 200 messages for new ones
							// Use maxSequence to ensure we get the most recent messages
							const endSeq = maxSequence;
							const startSeq = Math.max(1, endSeq - messagesToCheck + 1);
							const sequenceRange = `${startSeq}:${endSeq}`;

							setRefreshStatus({
								isRefreshing: true,
								message: `🔄 Checking for new messages...`,
							});

							const fetchedMessages = await emailService.getMessages(
								account.id,
								selectedFolder,
								messagesToCheck,
								sequenceRange,
							);

							// Filter out messages we already have by UID
							const existingUids = new Set(
								cachedMessages
									.map((m: EmailMessage) => m.uid)
									.filter((uid): uid is number => uid !== undefined),
							);

							const newMessages = fetchedMessages.filter(
								(message: EmailMessage) =>
									message.uid && !existingUids.has(message.uid),
							);

							if (newMessages.length > 0) {
								// Merge new messages with cached ones, removing duplicates by UID
								const uidMap = new Map<number, EmailMessage>();

								// Add existing messages
								for (const message of cachedMessages) {
									if (message.uid) uidMap.set(message.uid, message);
								}

								// Add new messages (will overwrite if UID exists)
								for (const message of fetchedMessages) {
									if (message.uid) uidMap.set(message.uid, message);
								}

								allMessages = [...uidMap.values()];
							} else {
								// No new messages, keep existing cache
								allMessages = cachedMessages;
							}
						}
					}

					await cacheService.updateMessages(
						allMessages,
						selectedFolder,
						account.id,
					);
					// Update folder metadata with total count
					await cacheService.updateFolderMetadata(
						selectedFolder,
						account.id,
						allMessages.length,
						allMessages.filter(message => !message.flags.includes('\\Seen'))
							.length,
					);
					setRefreshStatus({
						isRefreshing: false,
						message: `✓ Refreshed ${selectedFolder} (${allMessages.length} messages)`,
					});
					// Trigger refresh in MessageList
					setRefreshTrigger(previous => previous + 1);
				}
			} else if (scope === 'inbox') {
				// Quick refresh for inbox - only fetch recent messages
				let totalNewMessages = 0;
				for (const account of emailAccounts) {
					// Get the current cached messages
					// eslint-disable-next-line no-await-in-loop
					const cachedMessages = await cacheService.getCachedMessages(
						'INBOX',
						account.id,
						10_000,
					);

					// Get the folder status to know the current max sequence
					// eslint-disable-next-line no-await-in-loop
					const folderStatus = await emailService.getFolderStatus(
						account.id,
						'INBOX',
					);

					// Only fetch if there are messages in the folder
					if (folderStatus.total > 0) {
						// For quick refresh, always fetch the most recent messages
						// This ensures we don't miss any new messages
						const messagesToFetch = 100; // Fetch last 100 messages for quick refresh
						// Use maxSequence to ensure we get the most recent messages
						const endSeq = folderStatus.maxSequence;
						const startSeq = Math.max(1, endSeq - messagesToFetch + 1);
						const sequenceRange = `${startSeq}:${endSeq}`;

						setRefreshStatus({
							isRefreshing: true,
							message: `🔄 Checking ${account.email} inbox...`,
						});

						// eslint-disable-next-line no-await-in-loop
						const fetchedMessages = await emailService.getMessages(
							account.id,
							'INBOX',
							messagesToFetch,
							sequenceRange,
						);

						// Filter out messages we already have by UID
						const existingUids = new Set(
							cachedMessages
								.map((m: EmailMessage) => m.uid)
								.filter((uid): uid is number => uid !== undefined),
						);

						const newMessages = fetchedMessages.filter(
							(message: EmailMessage) =>
								message.uid && !existingUids.has(message.uid),
						);

						if (newMessages.length > 0) {
							// Merge new messages with cached ones, removing duplicates by UID
							const uidMap = new Map<number, EmailMessage>();

							// Add existing messages
							for (const message of cachedMessages) {
								if (message.uid) uidMap.set(message.uid, message);
							}

							// Add new messages (will overwrite if UID exists)
							for (const message of fetchedMessages) {
								if (message.uid) uidMap.set(message.uid, message);
							}

							const allMessages = [...uidMap.values()];

							// eslint-disable-next-line no-await-in-loop
							await cacheService.updateMessages(
								allMessages,
								'INBOX',
								account.id,
							);
							totalNewMessages += newMessages.length;

							debugLog(
								'refresh',
								`Found ${newMessages.length} new messages for ${account.email}`,
							);
						} else {
							debugLog('refresh', `No new messages for ${account.email}`);
						}
					}
				}

				// Update refresh status
				if (totalNewMessages > 0) {
					setRefreshStatus({
						isRefreshing: false,
						message: `✓ Found ${totalNewMessages} new message${
							totalNewMessages > 1 ? 's' : ''
						} in inbox`,
					});
				} else {
					setRefreshStatus({
						isRefreshing: false,
						message: `✓ Inbox is up to date`,
					});
				}

				// Trigger refresh in MessageList
				setRefreshTrigger(previous => previous + 1);
			} else {
				// Refresh all folders - this could take a while
				setRefreshStatus({
					isRefreshing: false,
					message: '✓ Full refresh not yet implemented',
				});
			}

			// Clear message after 3 seconds
			setTimeout(() => {
				setRefreshStatus({isRefreshing: false});
			}, 3000);
		} catch (error: unknown) {
			setRefreshStatus({
				isRefreshing: false,
				error: error instanceof Error ? error.message : 'Refresh failed',
			});
			setTimeout(() => {
				setRefreshStatus({isRefreshing: false});
			}, 5000);
		}
	};

	const handleCacheStatus = async () => {
		try {
			const stats = await cacheService.getCacheStats();
			const sizeInMb = (stats.totalSize / 1024 / 1024).toFixed(2);
			console.log(`📊 Cache Statistics:`);
			console.log(`   Total messages: ${stats.totalMessages}`);
			console.log(`   Cache size: ${sizeInMb} MB`);
			console.log(`   Oldest entry: ${String(stats.oldestMessage ?? 'None')}`);
		} catch (error: unknown) {
			console.error('Failed to get cache stats:', error);
		}
	};

	const handleCacheClear = async () => {
		try {
			await cacheService.clearAllCache();
			console.log('✓ Cache cleared successfully');
		} catch (error: unknown) {
			console.error('Failed to clear cache:', error);
		}
	};

	const handleAutoRefreshToggle = () => {
		const currentEnabled = settingsService.getAutoRefreshEnabled();
		const nextEnabled = !currentEnabled;
		settingsService.setAutoRefreshEnabled(nextEnabled);
		console.log(`Auto-refresh ${nextEnabled ? 'enabled' : 'disabled'}`);
		if (nextEnabled) {
			const interval = settingsService.getAutoRefreshInterval();
			console.log(
				`Messages will refresh automatically every ${interval} minutes`,
			);
		}
	};

	const handleAutoRefreshInterval = (command: string) => {
		const args = command.split(' ');
		if (args.length > 1 && args[1]) {
			const minutes = Number.parseInt(args[1], 10);
			if (!Number.isNaN(minutes) && minutes >= 1 && minutes <= 60) {
				settingsService.setAutoRefreshInterval(minutes);
				console.log(`Auto-refresh interval set to ${minutes} minutes`);
				if (settingsService.getAutoRefreshEnabled()) {
					console.log('Changes will take effect on next folder switch');
				} else {
					console.log(
						'Note: Auto-refresh is currently disabled. Use /auto-refresh to enable',
					);
				}
			} else {
				console.log('Usage: /auto-refresh-interval <minutes> (1-60)');
			}
		} else {
			const currentInterval = settingsService.getAutoRefreshInterval();
			const isEnabled = settingsService.getAutoRefreshEnabled();
			console.log(`Current auto-refresh interval: ${currentInterval} minutes`);
			console.log(`Auto-refresh is: ${isEnabled ? 'enabled' : 'disabled'}`);
			console.log('Usage: /auto-refresh-interval <minutes> to change');
		}
	};

	const handleCommand = async (command: string) => {
		const trimmedCommand = command.trim();
		if (!trimmedCommand) return;

		if (!trimmedCommand.startsWith('/')) {
			await handleAssistantQuery(trimmedCommand);
			return;
		}

		const cmd = trimmedCommand.toLowerCase();
		debugLog('App.tsx handleCommand', 'Processing command', {
			command: trimmedCommand,
			cmd,
		});

		switch (cmd) {
			case '/quit': {
				onQuit();
				break;
			}

			case '/compose': {
				setComposeMode('compose');
				setReplyToMessage(undefined);
				setViewMode('compose');
				break;
			}

			case '/add-account': {
				setViewMode('addAccount');
				break;
			}

			case '/update-account':
			case '/edit-account': {
				setViewMode('editAccount');
				break;
			}

			case '/remove-account': {
				setViewMode('removeAccount');
				break;
			}

			case '/settings': {
				setViewMode('settings');
				break;
			}

			case '/setpage': {
				const args = trimmedCommand.split(' ');
				if (args.length > 1 && args[1]) {
					const number_ = Number.parseInt(args[1], 10);
					if (!Number.isNaN(number_) && number_ > 0 && number_ <= 100) {
						settingsService.setMessagesPerPage(number_);
						console.log(
							`Messages per page set to ${number_}. Restart to apply changes.`,
						);
					} else {
						console.log('Usage: /setpage <number> (1-100)');
					}
				} else {
					console.log(
						`Current messages per page: ${settingsService.getMessagesPerPage()}`,
					);
					console.log('Usage: /setpage <number> to change');
				}

				break;
			}

			case '/refresh':
			case '/sync':
			case '/r': {
				await handleRefresh('current');
				break;
			}

			case '/refresh-all': {
				await handleRefresh('all');
				break;
			}

			case '/refresh-inbox': {
				await handleRefresh('inbox');
				break;
			}

			case '/cache-status': {
				await handleCacheStatus();
				break;
			}

			case '/cache-clear': {
				await handleCacheClear();
				break;
			}

			case '/auto-refresh': {
				handleAutoRefreshToggle();
				break;
			}

			case '/auto-refresh-interval': {
				handleAutoRefreshInterval(trimmedCommand);
				break;
			}

			case '/assistant-clear': {
				setAssistantMessages([]);
				setAssistantStatus('idle');
				setAssistantError(undefined);
				console.log('🤖 Assistant conversation reset');
				break;
			}

			case '/download-path':
			case '/set-download-path': {
				const pathArgs = trimmedCommand.split(' ').slice(1);
				if (pathArgs.length > 0) {
					const newPath = pathArgs.join(' ');
					await downloadService.setDownloadPath(newPath);
					console.log(`✅ Download path set to: ${newPath}`);
				} else {
					console.log(
						`Current download path: ${downloadService.getDownloadPath()}`,
					);
					console.log('Usage: /download-path <path>');
				}

				break;
			}

			case '/download': {
				if (viewMode === 'email' && openedEmail) {
					const downloadArgs = trimmedCommand.split(' ').slice(1);
					if (downloadArgs.length > 0 && openedEmail.attachments) {
						const attachmentIndex =
							Number.parseInt(downloadArgs[0] ?? '0', 10) - 1;
						if (
							attachmentIndex >= 0 &&
							attachmentIndex < openedEmail.attachments.length
						) {
							const attachment = openedEmail.attachments[attachmentIndex];
							if (attachment) {
								const result = await downloadService.downloadAttachment(
									attachment,
								);
								if (result.success) {
									console.log(
										`✅ Downloaded ${attachment.filename} to ${String(
											result.filePath,
										)}`,
									);
								} else {
									console.log(`❌ Failed to download: ${String(result.error)}`);
								}
							}
						} else {
							console.log('❌ Invalid attachment number');
						}
					} else {
						console.log('Usage: /download <number>');
					}
				} else {
					console.log(
						'ℹ️ This command only works when viewing an email with attachments',
					);
				}

				break;
			}

			case '/download-all': {
				if (viewMode === 'email' && openedEmail && openedEmail.attachments) {
					const results = await downloadService.downloadMultipleAttachments(
						openedEmail.attachments,
					);
					const successful = results.filter(r => r.success);
					const failed = results.filter(r => !r.success);

					if (successful.length > 0) {
						console.log(
							`✅ Downloaded ${
								successful.length
							} file(s) to ${downloadService.getDownloadPath()}`,
						);
					}

					if (failed.length > 0) {
						console.log(`⚠️ Failed to download ${failed.length} file(s)`);
					}
				} else {
					console.log(
						'ℹ️ This command only works when viewing an email with attachments',
					);
				}

				break;
			}

			case '/search': {
				console.log('Search functionality not yet implemented');
				break;
			}

			case '/help': {
				console.log('Available commands:');
				console.log('/compose - Compose new email');
				console.log('/add-account - Add a new email account');
				console.log('/remove-account - Remove an email account');
				console.log('/settings - Open settings');
				console.log('/setpage <n> - Set messages per page');
				console.log('/refresh - Refresh current folder');
				console.log('/refresh-all - Refresh all folders');
				console.log('/refresh-inbox - Refresh inbox only');
				console.log('/auto-refresh - Toggle auto-refresh on/off');
				console.log(
					'/auto-refresh-interval <n> - Set refresh interval (minutes)',
				);
				console.log('/cache-status - Show cache statistics');
				console.log('/cache-clear - Clear all cached data');
				console.log('/download <n> - Download attachment n (in email view)');
				console.log('/download-all - Download all attachments (in email view)');
				console.log('/download-path <path> - Set download directory');
				console.log('/assistant-clear - Reset assistant conversation');
				console.log('/search - Search emails');
				console.log('/help - Show this help');
				console.log('/quit - Exit the application');
				break;
			}

			default: {
				console.log(`Unknown command: ${trimmedCommand}`);
			}
		}
	};

	const handleAddAccountComplete = async (
		account: EmailAccount | undefined,
	) => {
		if (account) {
			try {
				await emailService.saveAccount(account);
				const accounts = await emailService.getAccounts();
				setEmailAccounts(accounts);
				console.log(`Account ${account.email} added successfully!`);
			} catch (error: unknown) {
				console.error('Failed to add account:', error);
			}
		}

		setViewMode('main');
	};

	const handleRemoveAccountComplete = async (accountId: string | undefined) => {
		if (accountId) {
			try {
				await emailService.removeAccount(accountId);
				const accounts = await emailService.getAccounts();
				setEmailAccounts(accounts);

				// If we removed the currently selected account, reset selection
				if (selectedAccount === accountId) {
					setSelectedAccount(accounts.length > 0 ? accounts[0]?.id : undefined);
					setSelectedFolder('INBOX');
				}

				console.log('Account removed successfully!');
			} catch (error: unknown) {
				console.error('Failed to remove account:', error);
			}
		}

		setViewMode('main');
	};

	// Render according to view mode
	switch (viewMode) {
		case 'email': {
			return openedEmail ? (
				<EmailViewer
					assistantError={assistantError}
					assistantMessages={assistantMessages}
					assistantStatus={assistantStatus}
					downloadService={downloadService}
					isCommandInputActive={commandInputActive}
					message={openedEmail}
					onBack={handleBackToMain}
					onCommand={handleCommand}
					onCommandInputDeactivate={() => {
						setCommandInputActive(false);
					}}
					onForward={handleForward}
					onReply={handleReply}
				/>
			) : null;
		}

		case 'thread': {
			return openedThread ? (
				<ThreadViewer
					assistantError={assistantError}
					assistantMessages={assistantMessages}
					assistantStatus={assistantStatus}
					emailAccounts={emailAccounts}
					emailService={emailService}
					isCommandInputActive={commandInputActive}
					originalMessage={openedThread}
					onBack={handleBackToMain}
					onCommand={handleCommand}
					onCommandInputDeactivate={() => {
						setCommandInputActive(false);
					}}
				/>
			) : null;
		}

		case 'compose': {
			return (
				<EmailComposer
					availableAccounts={availableAccounts}
					defaultAccount={lastUsedAccount}
					mode={composeMode}
					replyTo={replyToMessage ?? undefined}
					onCancel={handleComposeCancel}
					onSend={handleComposeEmail}
				/>
			);
		}

		case 'addAccount': {
			return (
				<AddAccountDialog
					emailService={emailService}
					onComplete={handleAddAccountComplete}
				/>
			);
		}

		case 'editAccount': {
			return (
				<EditAccountView
					onCancel={() => {
						setViewMode('main');
					}}
					onComplete={async () => {
						setViewMode('main');
						const accounts = await emailService.getAccounts();
						setEmailAccounts(accounts);
					}}
				/>
			);
		}

		case 'removeAccount': {
			return (
				<RemoveAccountDialog
					accounts={emailAccounts}
					onComplete={handleRemoveAccountComplete}
				/>
			);
		}

		case 'settings': {
			return (
				<SettingsDialog
					settingsService={settingsService}
					onClose={() => {
						setViewMode('main');
					}}
				/>
			);
		}

		default: {
			// Main view with folder list and messages
			return (
				<Box flexDirection="column" height="100%">
					<Gradient name="summer">
						<BigText text="chaski" align="center" font="chrome" />
					</Gradient>
					<Box flexGrow={1}>
						<Box width={folderWidth}>
							<FolderList
								emailAccounts={emailAccounts}
								emailService={emailService}
								hasFocus={focusedComponent === 'folders' && !commandInputActive}
								selectedAccount={selectedAccount}
								selectedFolder={selectedFolder}
								width={folderWidth}
								onExpand={handleFolderExpand}
								onSelect={handleFolderSelect}
							/>
						</Box>
						<Box flexGrow={1}>
							<MessageList
								account={selectedAccount}
								cacheService={cacheService}
								emailAccounts={emailAccounts}
								emailService={emailService}
								folder={selectedFolder}
								hasFocus={
									focusedComponent === 'messages' && !commandInputActive
								}
								hasNavigated={folderExpanded}
								refreshStatus={refreshStatus}
								refreshTrigger={refreshTrigger}
								settingsService={settingsService}
								onEmailOpen={handleEmailOpen}
								onRefreshRequest={handleRefresh}
								onThreadOpen={handleThreadOpen}
							/>
						</Box>
					</Box>
					<AssistantPanel
						error={assistantError}
						messages={assistantMessages}
						status={assistantStatus}
					/>

					<CommandInput
						isActive={commandInputActive}
						onCommand={handleCommand}
						onDeactivate={() => {
							setCommandInputActive(false);
						}}
					/>
					<CommandBar
						commands={[
							{key: '↑↓', label: 'Navigate', action: 'navigate' as const},
							{key: '←→', label: 'Select', action: 'select' as const},
							{key: '⏎', label: 'Open', action: 'primary' as const},
							...(focusedComponent === 'messages'
								? [
										{
											key: 'Shift+N/P',
											label: 'Next/Prev',
											action: 'navigate' as const,
										},
								  ]
								: []),
							{key: 'C', label: 'Compose', action: 'secondary' as const},
							{key: 'ESC', label: 'Quit', action: 'quit' as const},
						]}
						isCommandInputActive={commandInputActive}
						view="main"
					/>
				</Box>
			);
		}
	}
}

export default App;
