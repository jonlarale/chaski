// src/index.tsx
import React, {useState, useEffect} from 'react';
import {render, Box, useApp, useInput, useStdout} from 'ink';
import FolderList from './components/FolderList.js';
import MessageList from './components/MessageList.js';
import CommandBar from './components/CommandBar.js';
import EmailViewer from './components/EmailViewer.js';
import ThreadViewer from './components/ThreadViewer.js';
import EmailComposer from './components/EmailComposer.js';
import CommandInput from './components/CommandInput.js';
import {AddAccountDialog} from './components/AddAccountDialog.js';
import {EditAccountView} from './components/EditAccountView.js';
import {SettingsDialog} from './components/SettingsDialog.js';
import {EmailService} from './services/emailService.js';
import {SettingsService} from './services/settingsService.js';
import {CacheService} from './services/cacheService.js';
import {EmailAccount, EmailMessage} from './types/email.js';
import {RefreshStatus} from './types/refresh.js';
import fs from 'fs';
import path from 'path';
import Gradient from 'ink-gradient';
import BigText from 'ink-big-text';
import {spacing} from './constants/index.js';

// Debug logging function
const debugLog = (component: string, message: string, data?: any) => {
	const timestamp = new Date().toISOString();
	const logEntry = `[${timestamp}] ${component}: ${message}${
		data ? ` ${JSON.stringify(data)}` : ''
	}\n`;
	try {
		fs.appendFileSync(path.join(process.cwd(), 'debug.log'), logEntry);
	} catch (err) {
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
	| 'settings';

interface Message {
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
	_original?: any; // Original EmailMessage data
}

const App = () => {
	const [selectedFolder, setFolder] = useState('INBOX');
	const [selectedAccount, setAccount] = useState<string | undefined>(undefined);
	const [focusedComponent, setFocusedComponent] =
		useState<FocusedComponent>('folders');
	const [viewMode, setViewMode] = useState<ViewMode>('main');
	const [openedEmail, setOpenedEmail] = useState<Message | null>(null);
	const [openedThread, setOpenedThread] = useState<Message | null>(null);
	const [folderExpanded, setFolderExpanded] = useState(false); // To track if a folder is expanded
	const [composeMode, setComposeMode] = useState<
		'compose' | 'reply' | 'forward'
	>('compose');
	const [replyToMessage, setReplyToMessage] = useState<Message | null>(null);
	const [lastUsedAccount, setLastUsedAccount] =
		useState<string>('example@gmail.com');
	const [commandInputActive, setCommandInputActive] = useState(false);
	const [emailService] = useState(() => new EmailService());
	const [settingsService] = useState(() => new SettingsService());
	const [cacheService] = useState(() => new CacheService());
	const [emailAccounts, setEmailAccounts] = useState<EmailAccount[]>([]);
	const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>({
		isRefreshing: false,
	});
	const [refreshTrigger, setRefreshTrigger] = useState(0);
	const app = useApp();
	const {stdout} = useStdout();

	debugLog('App.tsx', 'useApp hook result', {
		hasExit: !!app.exit,
		app: Object.keys(app || {}),
	});

	const onQuit = () => {
		debugLog('App.tsx onQuit', 'onQuit called, forcing immediate exit');
		// Just exit immediately - Ink's app.exit() seems to not be working
		process.exit(0);
	};

	// Calculate responsive folder width (30% with 25 char minimum)
	const terminalWidth = stdout.columns || 80;
	const folderWidth = Math.max(
		Math.floor(terminalWidth * spacing.folder.widthPercent),
		spacing.folder.minWidth,
	);

	// Load email accounts on mount
	useEffect(() => {
		emailService.getAccounts().then(setEmailAccounts).catch(console.error);
	}, [emailService]);

	// Get available account emails
	const availableAccounts = emailAccounts.map(acc => acc.email);

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
			setReplyToMessage(null);
			setViewMode('compose');
			return;
		}

		// Only handle horizontal navigation between components when:
		// 1. We're in folders and have a selected account (to go to messages)
		// 2. We're in messages (to go back to folders)
		if (key.rightArrow) {
			// → only advances if we're in folders AND have a selected account
			if (focusedComponent === 'folders' && selectedAccount) {
				setFocusedComponent('messages');
			}
		}

		if (key.leftArrow) {
			// ← goes back from messages to folders
			if (focusedComponent === 'messages') {
				setFocusedComponent('folders');
				// Clear account selection to return to accounts level
				setAccount(undefined);
				// Keep folderExpanded as true to show selection message
			}
		}
	});

	const handleFolderExpand = (expanded: boolean) => {
		setFolderExpanded(expanded);
		// If folder is collapsed, clear selected account
		if (!expanded) {
			setAccount(undefined);
		}
	};

	const handleFolderSelect = (folder: string, account?: string) => {
		setFolder(folder);
		setAccount(account);
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
			const account = emailAccounts.find(acc => acc.email === selectedAccount);
			if (account && message._original.id) {
				try {
					// Mark as read in the email service (this will update IMAP)
					await emailService.markAsRead(
						account.id,
						selectedFolder,
						message._original.id,
					);

					// Update the cache to reflect the read status
					const updatedFlags = [...(message._original.flags || [])];
					if (!updatedFlags.includes('\\Seen')) {
						updatedFlags.push('\\Seen');
					}
					await cacheService.updateMessageFlags(
						message._original.id,
						selectedFolder,
						account.id,
						updatedFlags,
					);
				} catch (err) {
					console.error('Failed to mark message as read:', err);
				}
			}
		}
	};

	const handleThreadOpen = (message: Message) => {
		setOpenedThread(message);
		setViewMode('thread');
	};

	const handleBackToMain = () => {
		setOpenedEmail(null);
		setOpenedThread(null);
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
		setReplyToMessage(null);
	};

	const handleComposeCancel = () => {
		setViewMode('main');
		setComposeMode('compose');
		setReplyToMessage(null);
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
						10000, // Get max 10000 cached messages to check UIDs
					);

					// Get the total messages in the folder first
					const folderStatus = await emailService.getFolderStatus(
						account.id,
						selectedFolder,
					);

					const totalMessages = folderStatus.total;
					let allMessages: any[] = [];

					// Smart refresh strategy:
					// 1. Check recent messages for any new ones
					// 2. If this is the first load or cache is empty, do a full load
					const isInitialLoad = cachedMessages.length === 0;

					if (totalMessages > 0) {
						if (isInitialLoad) {
							// Initial load - fetch progressively
							const firstBatchSize = 50;
							const regularBatchSize = 500;
							const firstEndSeq = totalMessages;
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
							setRefreshTrigger(prev => prev + 1);

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

									const batchMessages = await emailService.getMessages(
										account.id,
										selectedFolder,
										regularBatchSize,
										sequenceRange,
									);

									allMessages = allMessages.concat(batchMessages);

									// Update status to show progress
									setRefreshStatus({
										isRefreshing: true,
										message: `🔄 Loading messages... ${allMessages.length}/${totalMessages}`,
									});

									// Periodically update cache
									if (allMessages.length % 1000 === 0) {
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
							const endSeq = totalMessages;
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
							const existingUIDs = new Set(
								cachedMessages
									.map((m: EmailMessage) => m.uid)
									.filter((uid): uid is number => uid !== undefined),
							);

							const newMessages = fetchedMessages.filter(
								(msg: EmailMessage) => msg.uid && !existingUIDs.has(msg.uid),
							);

							if (newMessages.length > 0) {
								// Merge new messages with cached ones, removing duplicates by UID
								const uidMap = new Map<number, EmailMessage>();

								// Add existing messages
								cachedMessages.forEach((msg: EmailMessage) => {
									if (msg.uid) uidMap.set(msg.uid, msg);
								});

								// Add new messages (will overwrite if UID exists)
								fetchedMessages.forEach((msg: EmailMessage) => {
									if (msg.uid) uidMap.set(msg.uid, msg);
								});

								allMessages = Array.from(uidMap.values());
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
						allMessages.filter(msg => !msg.flags.includes('\\Seen')).length,
					);
					setRefreshStatus({
						isRefreshing: false,
						message: `✓ Refreshed ${selectedFolder} (${allMessages.length} messages)`,
					});
					// Trigger refresh in MessageList
					setRefreshTrigger(prev => prev + 1);
				}
			} else if (scope === 'inbox') {
				// Quick refresh for inbox - only fetch recent messages
				let totalNewMessages = 0;
				for (const account of emailAccounts) {
					// Get the current cached messages
					const cachedMessages = await cacheService.getCachedMessages(
						'INBOX',
						account.id,
						10000,
					);

					// Get the folder status to know the current max sequence
					const folderStatus = await emailService.getFolderStatus(
						account.id,
						'INBOX',
					);

					// Only fetch if there are messages in the folder
					if (folderStatus.total > 0) {
						// For quick refresh, always fetch the most recent messages
						// This ensures we don't miss any new messages
						const messagesToFetch = 100; // Fetch last 100 messages for quick refresh
						const endSeq = folderStatus.total;
						const startSeq = Math.max(1, endSeq - messagesToFetch + 1);
						const sequenceRange = `${startSeq}:${endSeq}`;

						setRefreshStatus({
							isRefreshing: true,
							message: `🔄 Checking ${account.email} inbox...`,
						});

						const fetchedMessages = await emailService.getMessages(
							account.id,
							'INBOX',
							messagesToFetch,
							sequenceRange,
						);

						// Filter out messages we already have by UID
						const existingUIDs = new Set(
							cachedMessages
								.map((m: EmailMessage) => m.uid)
								.filter((uid): uid is number => uid !== undefined),
						);

						const newMessages = fetchedMessages.filter(
							(msg: EmailMessage) => msg.uid && !existingUIDs.has(msg.uid),
						);

						if (newMessages.length > 0) {
							// Merge new messages with cached ones, removing duplicates by UID
							const uidMap = new Map<number, EmailMessage>();

							// Add existing messages
							cachedMessages.forEach((msg: EmailMessage) => {
								if (msg.uid) uidMap.set(msg.uid, msg);
							});

							// Add new messages (will overwrite if UID exists)
							fetchedMessages.forEach((msg: EmailMessage) => {
								if (msg.uid) uidMap.set(msg.uid, msg);
							});

							const allMessages = Array.from(uidMap.values());

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
				setRefreshTrigger(prev => prev + 1);
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
		} catch (error) {
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
			const sizeInMB = (stats.totalSize / 1024 / 1024).toFixed(2);
			console.log(`📊 Cache Statistics:`);
			console.log(`   Total messages: ${stats.totalMessages}`);
			console.log(`   Cache size: ${sizeInMB} MB`);
			console.log(`   Oldest entry: ${stats.oldestMessage || 'None'}`);
		} catch (error) {
			console.error('Failed to get cache stats:', error);
		}
	};

	const handleCacheClear = async () => {
		try {
			await cacheService.clearAllCache();
			console.log('✓ Cache cleared successfully');
		} catch (error) {
			console.error('Failed to clear cache:', error);
		}
	};

	const handleAutoRefreshToggle = () => {
		const currentEnabled = settingsService.getAutoRefreshEnabled();
		settingsService.setAutoRefreshEnabled(!currentEnabled);
		console.log(`Auto-refresh ${!currentEnabled ? 'enabled' : 'disabled'}`);
		if (!currentEnabled) {
			const interval = settingsService.getAutoRefreshInterval();
			console.log(
				`Messages will refresh automatically every ${interval} minutes`,
			);
		}
	};

	const handleAutoRefreshInterval = (command: string) => {
		const args = command.split(' ');
		if (args.length > 1 && args[1]) {
			const minutes = parseInt(args[1]);
			if (!isNaN(minutes) && minutes >= 1 && minutes <= 60) {
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
		const cmd = command.toLowerCase().trim();
		debugLog('App.tsx handleCommand', 'Processing command', {command, cmd});

		switch (cmd) {
			case '/quit':
				onQuit();
				break;
			case '/compose':
				setComposeMode('compose');
				setReplyToMessage(null);
				setViewMode('compose');
				break;
			case '/add-account':
				setViewMode('addAccount');
				break;
			case '/update-account':
			case '/edit-account':
				setViewMode('editAccount');
				break;
			case '/remove-account':
				handleRemoveAccount();
				break;
			case '/settings':
				setViewMode('settings');
				break;
			case '/setpage':
				// Quick command to set messages per page
				const args = command.split(' ');
				if (args.length > 1 && args[1]) {
					const num = parseInt(args[1]);
					if (!isNaN(num) && num > 0 && num <= 100) {
						settingsService.setMessagesPerPage(num);
						console.log(
							`Messages per page set to ${num}. Restart to apply changes.`,
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
			case '/refresh':
			case '/sync':
			case '/r':
				await handleRefresh('current');
				break;
			case '/refresh-all':
				await handleRefresh('all');
				break;
			case '/refresh-inbox':
				await handleRefresh('inbox');
				break;
			case '/cache-status':
				await handleCacheStatus();
				break;
			case '/cache-clear':
				await handleCacheClear();
				break;
			case '/auto-refresh':
				handleAutoRefreshToggle();
				break;
			case '/auto-refresh-interval':
				handleAutoRefreshInterval(command);
				break;
			case '/search':
				console.log('Search functionality not yet implemented');
				break;
			case '/help':
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
				console.log('/search - Search emails');
				console.log('/help - Show this help');
				console.log('/quit - Exit the application');
				break;
			default:
				console.log(`Unknown command: ${command}`);
		}
	};

	const handleAddAccountComplete = async (account: EmailAccount | null) => {
		if (account) {
			try {
				await emailService.saveAccount(account);
				const accounts = await emailService.getAccounts();
				setEmailAccounts(accounts);
				console.log(`Account ${account.email} added successfully!`);
			} catch (error) {
				console.error('Failed to add account:', error);
			}
		}
		setViewMode('main');
	};

	const handleRemoveAccount = async () => {
		if (emailAccounts.length === 0) {
			console.log('No accounts to remove');
			return;
		}

		console.log('Available accounts:');
		emailAccounts.forEach((acc, index) => {
			console.log(`${index + 1}. ${acc.email} (${acc.provider})`);
		});
		console.log(
			'\nType the number of the account to remove (or "cancel" to abort)',
		);

		// This is a simple implementation - in a real app you'd want a proper selection UI
		// For now, users can use /add-account to re-add with correct settings
	};

	// Render according to view mode
	switch (viewMode) {
		case 'email':
			return openedEmail ? (
				<EmailViewer
					message={openedEmail}
					onBack={handleBackToMain}
					onReply={handleReply}
					onForward={handleForward}
					commandInputActive={commandInputActive}
					onCommandInputDeactivate={() => setCommandInputActive(false)}
					onCommand={handleCommand}
				/>
			) : null;

		case 'thread':
			return openedThread ? (
				<ThreadViewer
					originalMessage={openedThread}
					onBack={handleBackToMain}
					emailService={emailService}
					emailAccounts={emailAccounts}
					commandInputActive={commandInputActive}
					onCommandInputDeactivate={() => setCommandInputActive(false)}
					onCommand={handleCommand}
				/>
			) : null;

		case 'compose':
			return (
				<EmailComposer
					onSend={handleComposeEmail}
					onCancel={handleComposeCancel}
					replyTo={replyToMessage || undefined}
					mode={composeMode}
					availableAccounts={availableAccounts}
					defaultAccount={lastUsedAccount}
				/>
			);

		case 'addAccount':
			return <AddAccountDialog onComplete={handleAddAccountComplete} />;

		case 'editAccount':
			return (
				<EditAccountView
					onComplete={async () => {
						setViewMode('main');
						const accounts = await emailService.getAccounts();
						setEmailAccounts(accounts);
					}}
					onCancel={() => setViewMode('main')}
				/>
			);

		case 'settings':
			return (
				<SettingsDialog
					settingsService={settingsService}
					onClose={() => setViewMode('main')}
				/>
			);

		case 'main':
		default:
			// Main view with folder list and messages
			return (
				<Box flexDirection="column" height="100%">
					<Gradient name="summer">
						<BigText text="chaski" align="center" font="chrome" />
					</Gradient>
					<Box flexGrow={1}>
						<Box width={folderWidth}>
							<FolderList
								onSelect={handleFolderSelect}
								onExpand={handleFolderExpand}
								hasFocus={focusedComponent === 'folders' && !commandInputActive}
								selectedFolder={selectedFolder}
								selectedAccount={selectedAccount}
								width={folderWidth}
								emailService={emailService}
								emailAccounts={emailAccounts}
							/>
						</Box>
						<Box flexGrow={1}>
							<MessageList
								folder={selectedFolder}
								account={selectedAccount}
								hasFocus={
									focusedComponent === 'messages' && !commandInputActive
								}
								hasNavigated={folderExpanded}
								onEmailOpen={handleEmailOpen}
								onThreadOpen={handleThreadOpen}
								emailService={emailService}
								emailAccounts={emailAccounts}
								settingsService={settingsService}
								cacheService={cacheService}
								refreshStatus={refreshStatus}
								onRefreshRequest={handleRefresh}
								refreshTrigger={refreshTrigger}
							/>
						</Box>
					</Box>
					<CommandInput
						isActive={commandInputActive}
						onDeactivate={() => setCommandInputActive(false)}
						onCommand={handleCommand}
					/>
					<CommandBar
						onQuit={onQuit}
						commandInputActive={commandInputActive}
						view="main"
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
					/>
				</Box>
			);
	}
};

render(<App />);
