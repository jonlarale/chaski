import React, {useState, useEffect, useRef} from 'react';
import {Box, Text, useInput, useStdout} from 'ink';
import {EmailService} from '../services/emailService.js';
import {SettingsService} from '../services/settingsService.js';
import {CacheService} from '../services/cacheService.js';
import {EmailAccount, EmailMessage} from '../types/email.js';
import {RefreshStatus} from '../types/refresh.js';
import {useDebug} from '../utils/debug.js';
import {colors, semanticColors, spacing} from '../constants/index.js';

interface Message {
	id: string;
	from: string;
	subject: string;
	date: string;
	read: boolean;
	preview: string;
	threadCount?: number; // Number of replies in thread
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
	// Store original EmailMessage for conversion back
	_original?: EmailMessage;
}

interface MessageListProps {
	folder: string;
	account?: string;
	hasFocus: boolean;
	hasNavigated: boolean; // To know if user has navigated/expanded any folder
	onEmailOpen: (message: Message) => void;
	onThreadOpen?: (message: Message) => void;
	emailService: EmailService;
	emailAccounts: EmailAccount[];
	settingsService: SettingsService;
	cacheService: CacheService;
	refreshStatus?: RefreshStatus;
	onRefreshRequest?: (scope: 'current' | 'all' | 'inbox') => void;
	refreshTrigger?: number;
}

// Format date with relative dates (Today, Yesterday)
const formatRelativeDate = (date: Date): string => {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterday = new Date(today);
	yesterday.setDate(yesterday.getDate() - 1);

	const messageDate = new Date(
		date.getFullYear(),
		date.getMonth(),
		date.getDate(),
	);

	if (messageDate.getTime() === today.getTime()) {
		return 'Today';
	} else if (messageDate.getTime() === yesterday.getTime()) {
		return 'Yesterday';
	} else {
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		});
	}
};

// Convert EmailMessage to Message interface
const convertEmailMessage = (email: EmailMessage): Message => {
	const from = email.from[0];
	const fromString = from?.name
		? `${from.name} <${from.address}>`
		: from?.address || 'Unknown';

	// Get text preview
	const preview = email.body.text
		? email.body.text.substring(0, 100).replace(/\n/g, ' ').trim() + '...'
		: 'No preview available';

	// Check if message is read based on flags
	const isRead = email.flags.includes('\\Seen');

	// Format date with relative dates
	const date = new Date(email.date);
	const dateString = formatRelativeDate(date);

	// Check for thread count based on references
	const threadCount = email.references ? email.references.length : undefined;

	return {
		id: email.id,
		from: fromString,
		subject: email.subject || '(No subject)',
		date: dateString,
		read: isRead,
		preview,
		threadCount,
		body: email.body,
		attachments: email.attachments,
		_original: email,
	};
};

// Format count for display (99+ for large numbers)
const formatCount = (count: number): string => {
	if (count > 99) return '99+';
	return count.toString();
};

// Format cache age for display
const formatCacheAge = (lastSync: Date | null): string => {
	if (!lastSync) return 'Not synced';

	const now = new Date();
	const diffMs = now.getTime() - lastSync.getTime();
	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return 'Just now';
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	return `${diffDays}d ago`;
};

const MessageList: React.FC<MessageListProps> = ({
	folder,
	account,
	hasFocus,
	hasNavigated,
	onEmailOpen,
	onThreadOpen,
	emailService,
	emailAccounts,
	settingsService,
	cacheService,
	refreshStatus,
	onRefreshRequest,
	refreshTrigger,
}) => {
	const debug = useDebug('MessageList');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [messages, setMessages] = useState<Message[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [currentPage, setCurrentPage] = useState(1);
	const [totalMessages, setTotalMessages] = useState(0);
	const [_messageCache, setMessageCache] = useState<{[key: string]: Message[]}>(
		{},
	);
	const [isChangingPage, setIsChangingPage] = useState(false);
	const [viewportOffset, setViewportOffset] = useState(0);
	const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
	const [isFromCache, setIsFromCache] = useState(false);
	const [newMessageCount, setNewMessageCount] = useState(0);
	const [lastMessageUIDs, setLastMessageUIDs] = useState<Set<number>>(
		new Set(),
	);
	const {stdout} = useStdout();
	const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
	const lastAutoRefreshRef = useRef<Date | null>(null);

	const messagesPerPage = settingsService.getMessagesPerPage();
	const totalPages = Math.ceil(totalMessages / messagesPerPage);

	// Calculate viewport size - leave room for header, command bar, etc.
	const terminalHeight = stdout.rows || 24;
	const viewportHeight = Math.max(5, terminalHeight - 6); // Reserve 6 lines for UI chrome
	const itemHeight = 4; // Each message takes ~4 lines (from, subject, preview, margin)
	const visibleItems = Math.floor(viewportHeight / itemHeight);

	// Reset page and cache when folder or account changes
	useEffect(() => {
		setCurrentPage(1);
		setSelectedIndex(0);
		setViewportOffset(0);
		setMessageCache({});
		setTotalMessages(0);
		lastAutoRefreshRef.current = null;
	}, [folder, account]);

	// Set up auto-refresh interval
	useEffect(() => {
		// Clear any existing interval
		if (autoRefreshIntervalRef.current) {
			clearInterval(autoRefreshIntervalRef.current);
			autoRefreshIntervalRef.current = null;
		}

		// Only set up interval if auto-refresh is enabled and we have focus
		if (
			settingsService.getAutoRefreshEnabled() &&
			hasFocus &&
			account &&
			folder
		) {
			const intervalMinutes = settingsService.getAutoRefreshInterval();
			const intervalMs = intervalMinutes * 60 * 1000;

			debug.info('Setting up auto-refresh interval', {
				intervalMinutes,
				folder,
				account,
			});

			autoRefreshIntervalRef.current = setInterval(() => {
				// Only refresh if we're not already refreshing and enough time has passed
				if (!refreshStatus?.isRefreshing && onRefreshRequest) {
					const now = new Date();
					const shouldRefresh =
						!lastAutoRefreshRef.current ||
						now.getTime() - lastAutoRefreshRef.current.getTime() >= intervalMs;

					if (shouldRefresh) {
						debug.info('Auto-refreshing due to interval', {folder, account});
						lastAutoRefreshRef.current = now;
						onRefreshRequest('current');
					}
				}
			}, intervalMs);
		}

		return () => {
			if (autoRefreshIntervalRef.current) {
				clearInterval(autoRefreshIntervalRef.current);
				autoRefreshIntervalRef.current = null;
			}
		};
	}, [
		hasFocus,
		account,
		folder,
		settingsService,
		refreshStatus?.isRefreshing,
		onRefreshRequest,
		debug,
	]);

	// Track new messages after refresh
	useEffect(() => {
		if (refreshTrigger && refreshTrigger > 0 && messages.length > 0) {
			// After a refresh, check if we have new messages
			const currentUIDs = new Set(
				messages
					.map(m => m._original?.uid)
					.filter((uid): uid is number => uid !== undefined),
			);

			if (lastMessageUIDs.size > 0) {
				const newUIDs = Array.from(currentUIDs).filter(
					uid => !lastMessageUIDs.has(uid),
				);
				if (newUIDs.length > 0) {
					setNewMessageCount(newUIDs.length);
					// Clear the notification after 5 seconds
					setTimeout(() => setNewMessageCount(0), 5000);
				}
			}
			setLastMessageUIDs(currentUIDs);
		}
	}, [refreshTrigger, messages]);

	// Load messages when folder, account, page changes, or after refresh
	useEffect(() => {
		if (!account || !folder) {
			setMessages([]);
			return;
		}

		const loadMessages = async () => {
			// Initial auto-refresh logic - on first load if cache is old
			if (
				currentPage === 1 &&
				!isChangingPage &&
				onRefreshRequest &&
				settingsService.getAutoRefreshEnabled()
			) {
				// Check if we should auto-refresh (e.g., no cache or old cache)
				const emailAccount = emailAccounts.find(acc => acc.email === account);
				if (emailAccount) {
					const syncTime = await cacheService.getLastSyncTime(
						folder,
						emailAccount.id,
					);

					// Auto-refresh if no cache or cache is older than the configured interval
					const intervalMinutes = settingsService.getAutoRefreshInterval();
					const shouldAutoRefresh =
						!syncTime ||
						new Date().getTime() - syncTime.getTime() >
							intervalMinutes * 60 * 1000;

					if (shouldAutoRefresh && !refreshStatus?.isRefreshing) {
						debug.info('Initial auto-refresh on folder load', {
							folder,
							account,
						});
						lastAutoRefreshRef.current = new Date();
						// Don't await this - let it run in background
						onRefreshRequest('current');
					}
				}
			}
			// First, try to load from SQLite cache
			try {
				const emailAccount = emailAccounts.find(acc => acc.email === account);
				if (!emailAccount) {
					throw new Error(`Account ${account} not found`);
				}

				// Get cached messages immediately
				const offset = (currentPage - 1) * messagesPerPage;
				const cachedMessages = await cacheService.getCachedMessages(
					folder,
					emailAccount.id,
					messagesPerPage,
					offset,
				);

				if (cachedMessages.length > 0) {
					// Show cached messages immediately
					const convertedMessages = cachedMessages.map(convertEmailMessage);

					setMessages(convertedMessages);
					setIsFromCache(true);

					// Get last sync time
					const syncTime = await cacheService.getLastSyncTime(
						folder,
						emailAccount.id,
					);
					setLastSyncTime(syncTime);

					// Get total message count from cache metadata
					// Use the actual folder name (not normalized) for cache lookup
					const folders = await emailService.getFolders(emailAccount.id);
					let actualFolderName = folder;
					const normalizedFolder = folder.toUpperCase();
					for (const f of folders) {
						const normalized = f.name.toUpperCase();
						if (
							normalized === normalizedFolder ||
							(normalizedFolder === 'SENT' &&
								(normalized === 'SENT MAIL' ||
									normalized === 'SENT MESSAGES')) ||
							(normalizedFolder === 'DELETED' &&
								(normalized === 'DELETED MESSAGES' ||
									normalized === 'DELETED ITEMS')) ||
							(normalizedFolder === 'JUNK' &&
								(normalized === 'JUNK E-MAIL' || normalized === 'JUNK MAIL')) ||
							(normalizedFolder === 'TRASH' && normalized === 'DELETED')
						) {
							actualFolderName = f.name;
							break;
						}
					}

					const metadata = await cacheService.getFolderMetadata(
						actualFolderName,
						emailAccount.id,
					);
					if (metadata && metadata.totalMessages > 0) {
						setTotalMessages(metadata.totalMessages);
						debug.info('Got total from cache metadata', {
							folder: actualFolderName,
							total: metadata.totalMessages,
						});
					} else {
						// If no metadata in cache, trigger refresh immediately
						if (!refreshStatus?.isRefreshing && onRefreshRequest) {
							debug.info('No cache metadata, triggering immediate refresh');
							onRefreshRequest('current');
						}
						setTotalMessages(0);
					}

					debug.info('Loaded from cache', {
						count: cachedMessages.length,
						lastSync: syncTime,
						totalMessages: metadata?.totalMessages || 0,
					});

					// Check if cache has incomplete data
					const totalPages = Math.ceil(
						(metadata?.totalMessages || 0) / messagesPerPage,
					);
					const isLastPage = currentPage >= totalPages;

					// If we're not on the last page but have fewer messages than expected,
					// the cache is incomplete - fall through to IMAP fetch
					if (!isLastPage && cachedMessages.length < messagesPerPage) {
						debug.warn('Cache has incomplete page data, falling back to IMAP', {
							expected: messagesPerPage,
							got: cachedMessages.length,
							page: currentPage,
							totalPages,
						});
						// Don't return, continue to IMAP fetch below
					} else {
						// Cache is complete, we can use it
						return;
					}
				}
			} catch (err) {
				debug.warn('Failed to load from cache', err);
			}

			// If no cache or cache failed, load from IMAP
			setLoading(true);
			setError(null);
			setIsFromCache(false);

			try {
				debug.info('Loading messages from IMAP', {
					folder,
					account,
					page: currentPage,
				});
				// Find the account ID by email
				const emailAccount = emailAccounts.find(acc => acc.email === account);
				if (!emailAccount) {
					throw new Error(`Account ${account} not found`);
				}

				// Get the actual folder name for this account
				// Since we normalized folder names in FolderList, we need to find the real folder name
				const folders = await emailService.getFolders(emailAccount.id);
				let actualFolderName = folder;

				// Find the actual folder name that matches our normalized name
				const normalizedFolder = folder.toUpperCase();
				for (const f of folders) {
					const normalized = f.name.toUpperCase();
					if (
						normalized === normalizedFolder ||
						(normalizedFolder === 'SENT' &&
							(normalized === 'SENT MAIL' || normalized === 'SENT MESSAGES')) ||
						(normalizedFolder === 'DELETED' &&
							(normalized === 'DELETED MESSAGES' ||
								normalized === 'DELETED ITEMS')) ||
						(normalizedFolder === 'JUNK' &&
							(normalized === 'JUNK E-MAIL' || normalized === 'JUNK MAIL')) ||
						(normalizedFolder === 'TRASH' && normalized === 'DELETED')
					) {
						actualFolderName = f.name;
						break;
					}
				}

				// Always get the actual total count from the folder
				// This ensures we have accurate pagination info
				let actualTotalMessages = totalMessages;
				try {
					const folderStatus = await emailService.getFolderStatus(
						emailAccount.id,
						actualFolderName,
					);
					debug.info('Got folder status', {
						folder: actualFolderName,
						total: folderStatus.total,
						unseen: folderStatus.unseen,
						currentPage,
					});
					actualTotalMessages = folderStatus.total;
					setTotalMessages(folderStatus.total);
				} catch (err) {
					console.error('Failed to get folder status:', err);
					// If we can't get status and don't have a total, estimate
					if (totalMessages === 0) {
						actualTotalMessages = 100;
						setTotalMessages(100);
					} else {
						actualTotalMessages = totalMessages;
					}
				}

				// Calculate range for current page
				// IMAP sequences are 1-based, with sequence 1 being the OLDEST message
				// and the highest sequence being the NEWEST message
				// For page 1, we want the newest messages, so we need the highest sequences

				// Use the actual total we just got
				if (actualTotalMessages === 0) {
					debug.info('No messages in folder');
					setMessages([]);
					return;
				}

				// For page 1: we want messages from (total - 19) to total
				// For page 2: we want messages from (total - 39) to (total - 20)
				// But we need to account for gaps due to deleted messages
				const endSeq = Math.max(
					1,
					actualTotalMessages - (currentPage - 1) * messagesPerPage,
				);

				// Fetch 50% more messages to account for gaps
				const bufferSize = Math.ceil(messagesPerPage * 1.5);
				const startSeq = Math.max(1, endSeq - bufferSize + 1);

				// Ensure valid sequence range
				if (startSeq > endSeq) {
					console.error(`Invalid sequence range: ${startSeq}:${endSeq}`);
					setMessages([]);
					return;
				}

				console.log(
					`Loading messages ${startSeq}:${endSeq} for page ${currentPage} (total: ${actualTotalMessages})`,
				);

				// Load messages for current page
				const pageMessages = await emailService.getMessages(
					emailAccount.id,
					actualFolderName,
					messagesPerPage,
					`${startSeq}:${endSeq}`,
				);

				// Take only the messages we need for this page
				const messagesForPage = pageMessages.slice(0, messagesPerPage);

				// Don't update total - we got it from getFolderStatus
				debug.info('Loaded page of messages', {
					page: currentPage,
					messagesLoaded: messagesForPage.length,
					totalMessages: actualTotalMessages,
					totalPages: Math.ceil(actualTotalMessages / messagesPerPage),
					fetchedCount: pageMessages.length,
				});

				// Log first and last message dates for debugging
				if (messagesForPage.length > 0) {
					console.log(`Page ${currentPage} messages date range:`, {
						newest: messagesForPage[0]?.date || 'N/A',
						oldest: messagesForPage[messagesForPage.length - 1]?.date || 'N/A',
						count: messagesForPage.length,
					});
				}

				// Convert to Message format
				const convertedMessages = messagesForPage.map(convertEmailMessage);
				setMessages(convertedMessages);

				// Update SQLite cache with new messages (only cache the page we're showing)
				if (messagesForPage.length > 0) {
					await cacheService.updateMessages(
						messagesForPage,
						actualFolderName,
						emailAccount.id,
					);
					await cacheService.updateFolderMetadata(
						actualFolderName,
						emailAccount.id,
						actualTotalMessages,
						0, // We'll get unseen count from getFolderStatus
					);
					setLastSyncTime(new Date());
				}

				// Cache the results in memory too
				const cacheKey = `${account}-${folder}-${currentPage}`;
				setMessageCache(prev => ({
					...prev,
					[cacheKey]: convertedMessages,
				}));
			} catch (err) {
				console.error(`Failed to load messages for ${account}/${folder}:`, err);
				setError(
					err instanceof Error ? err.message : 'Failed to load messages',
				);
				setMessages([]);
			} finally {
				setLoading(false);
				setIsChangingPage(false);
			}
		};

		// Add a timeout to prevent hanging
		const timeoutId = setTimeout(() => {
			if (loading) {
				console.error('Message loading timed out');
				setLoading(false);
				setError('Loading timed out');
			}
		}, 10000); // 10 second timeout

		loadMessages().finally(() => {
			clearTimeout(timeoutId);
		});
	}, [
		folder,
		account,
		emailService,
		emailAccounts,
		currentPage,
		messagesPerPage,
		cacheService,
		refreshTrigger, // Re-run when refresh completes
	]);

	useInput((input, key) => {
		// Always let ESC pass through to parent for global handling
		if (key.escape) {
			return;
		}

		// Only process other keys if this component has focus
		if (!hasFocus) return;

		debug.debug('Key pressed in MessageList', {
			input,
			key,
			shift: key.shift,
			ctrl: key.ctrl,
			meta: key.meta,
			hasFocus,
			totalPages,
			currentPage,
		});

		// Navigation keys with viewport scrolling
		if (key.upArrow && selectedIndex > 0) {
			const newIndex = selectedIndex - 1;
			setSelectedIndex(newIndex);

			// Scroll up if needed
			if (newIndex < viewportOffset) {
				setViewportOffset(newIndex);
			}
		}

		if (key.downArrow && selectedIndex < messages.length - 1) {
			const newIndex = selectedIndex + 1;
			setSelectedIndex(newIndex);

			// Scroll down if needed
			if (newIndex >= viewportOffset + visibleItems) {
				setViewportOffset(
					Math.min(newIndex - visibleItems + 1, messages.length - visibleItems),
				);
			}
		}

		if (key.return || key.rightArrow) {
			// Enter or → to open email/thread
			const message = messages[selectedIndex];
			if (message) {
				debug.info('Opening message', {
					id: message.id,
					hasThread: !!message.threadCount,
				});
				if (message.threadCount && message.threadCount > 0 && onThreadOpen) {
					onThreadOpen(message);
				} else {
					onEmailOpen(message);
				}
			}
		}

		if (key.leftArrow) {
			// ← to go back to accounts of selected folder
			// This is handled in App.tsx by changing focus back to folders
		}

		// Page navigation with Shift+N (next) and Shift+P (previous)
		// Check both uppercase and the actual input character
		if (key.shift && (input === 'N' || input === 'n')) {
			debug.info('Shift+N detected', {
				input,
				shift: key.shift,
				currentPage,
				totalPages,
				loading,
			});
			// Next page (Shift+N)
			if (currentPage < totalPages) {
				debug.info('Moving to next page', {
					from: currentPage,
					to: currentPage + 1,
				});
				setIsChangingPage(true);
				setCurrentPage(currentPage + 1);
				setSelectedIndex(0);
				setViewportOffset(0);
			} else {
				debug.info('Cannot go to next page', {
					reason: 'Already on last page',
					currentPage,
					totalPages,
					totalMessages,
					messagesPerPage,
				});
			}
		}

		if (key.shift && (input === 'P' || input === 'p')) {
			debug.info('Shift+P detected', {
				input,
				shift: key.shift,
				currentPage,
				totalPages,
				loading,
			});
			// Previous page (Shift+P)
			if (currentPage > 1) {
				debug.info('Moving to previous page', {
					from: currentPage,
					to: currentPage - 1,
				});
				setIsChangingPage(true);
				setCurrentPage(currentPage - 1);
				setSelectedIndex(0);
				setViewportOffset(0);
			}
		}

		// Also keep PageUp/PageDown as alternatives
		if (key.pageDown && currentPage < totalPages) {
			setIsChangingPage(true);
			setCurrentPage(currentPage + 1);
			setSelectedIndex(0);
			setViewportOffset(0);
		}

		if (key.pageUp && currentPage > 1) {
			setIsChangingPage(true);
			setCurrentPage(currentPage - 1);
			setSelectedIndex(0);
			setViewportOffset(0);
		}

		// Home/End keys for quick navigation within current page
		if (input === 'g' && messages.length > 0) {
			// 'g' for go to top (vim style)
			setSelectedIndex(0);
			setViewportOffset(0);
		}

		if (input === 'G' && messages.length > 0) {
			// 'G' for go to bottom (vim style)
			const lastIndex = messages.length - 1;
			setSelectedIndex(lastIndex);
			setViewportOffset(Math.max(0, messages.length - visibleItems));
		}
	});

	// Create loading animation - must be declared before any returns
	const [loadingDots, setLoadingDots] = useState('');

	useEffect(() => {
		if (loading || refreshStatus?.isRefreshing) {
			const interval = setInterval(() => {
				setLoadingDots(prev => {
					if (prev === '') return '.';
					if (prev === '.') return '..';
					if (prev === '..') return '...';
					return '';
				});
			}, 400);
			return () => clearInterval(interval);
		}
		return undefined;
	}, [loading, refreshStatus?.isRefreshing]);

	const getFolderDisplayName = (folder: string, account?: string) => {
		if (account) {
			// Show specific account
			return `${account}`;
		} else {
			// Show general folder (when no account selected)
			switch (folder) {
				case 'INBOX':
					return 'All Inboxes';
				case 'SENT':
					return 'All Sent';
				case 'DRAFTS':
					return 'All Drafts';
				case 'SPAM':
					return 'All Spam';
				case 'TRASH':
					return 'All Trash';
				default:
					return folder;
			}
		}
	};

	// If no folder has been expanded, show nothing
	if (!hasNavigated) {
		return <Box padding={1}></Box>;
	}

	// Show loading state with animation - but only if we don't have cache
	if ((loading || refreshStatus?.isRefreshing) && messages.length === 0) {
		return (
			<Box flexDirection="column" padding={spacing.base}>
				<Text
					bold
					color={hasFocus ? semanticColors.folder.header : colors.gray}
				>
					📧 {getFolderDisplayName(folder, account)}{' '}
					{totalMessages > 0 && `(${formatCount(totalMessages)}) `}
					{totalPages > 1 && `[Page ${currentPage}/${totalPages}] `}
					{hasFocus && '◀'}
				</Text>
				<Box marginTop={spacing.marginSM} flexDirection="column">
					<Text color={colors.yellow}>
						{refreshStatus?.message ||
							(isChangingPage
								? `Loading page ${currentPage}`
								: 'Connecting to email server')}
						{loadingDots}
					</Text>
					<Box marginTop={spacing.marginXS}>
						<Text color={colors.gray} dimColor>
							This may take a moment on first load
						</Text>
					</Box>
				</Box>
			</Box>
		);
	}

	// Show error state
	if (error) {
		return (
			<Box padding={spacing.base}>
				<Text bold color={colors.red}>
					📧 Error: {error}
				</Text>
			</Box>
		);
	}

	// If no messages
	if (messages.length === 0) {
		// If no account selected, show selection message
		if (!account) {
			return (
				<Box padding={spacing.base}>
					<Text
						bold
						color={hasFocus ? semanticColors.folder.header : colors.gray}
					>
						📧 Select an account to view messages {hasFocus && '◀'}
					</Text>
				</Box>
			);
		}

		// If account selected but no messages, show empty account message
		return (
			<Box flexDirection="column" padding={spacing.base}>
				<Text
					bold
					color={hasFocus ? semanticColors.folder.header : colors.gray}
				>
					📧 {getFolderDisplayName(folder, account)} (0) {hasFocus && '◀'}
				</Text>
				<Box marginTop={spacing.marginSM}>
					<Text color={colors.gray}>No messages in {account}</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={spacing.base}>
			{/* New message notification */}
			{newMessageCount > 0 && (
				<Box marginBottom={1}>
					<Text bold color="green">
						✉️ {newMessageCount} new{' '}
						{newMessageCount === 1 ? 'message' : 'messages'} received!
					</Text>
				</Box>
			)}
			<Text bold color={hasFocus ? semanticColors.folder.header : colors.gray}>
				📧 {getFolderDisplayName(folder, account)} ({formatCount(totalMessages)}
				){' '}
				{totalPages > 1
					? `[Page ${currentPage}/${totalPages}] `
					: totalMessages > 0
					? '[Single Page] '
					: ''}
				{isFromCache && !refreshStatus?.isRefreshing && (
					<Text color={colors.gray}>
						[Cached {formatCacheAge(lastSyncTime)}]{' '}
					</Text>
				)}
				{refreshStatus?.isRefreshing && (
					<Text color={colors.yellow}>
						{refreshStatus.message || 'Syncing'}
						{loadingDots}{' '}
					</Text>
				)}
				{hasFocus && '◀'}
			</Text>
			<Box marginTop={1} flexDirection="column">
				{/* Scroll indicator - more messages above */}
				{viewportOffset > 0 && (
					<Box marginBottom={0}>
						<Text color={colors.gray} dimColor>
							▲ {viewportOffset} more message{viewportOffset > 1 ? 's' : ''}{' '}
							above
						</Text>
					</Box>
				)}

				{messages
					.slice(viewportOffset, viewportOffset + visibleItems)
					.map((message, displayIndex) => {
						const index = viewportOffset + displayIndex;
						const isSelected = index === selectedIndex && hasFocus;
						return (
							<Box
								key={message.id}
								marginBottom={spacing.message.marginBottom}
								flexDirection="row"
							>
								{/* Left-side unread indicator */}
								<Box width={2} flexShrink={0}>
									{!message.read && (
										<Text
											color={
												isSelected
													? semanticColors.message.unreadBulletSelected
													: semanticColors.message.unreadBullet
											}
											backgroundColor={
												isSelected ? semanticColors.folder.selected : undefined
											}
										>
											●
										</Text>
									)}
								</Box>

								{/* Message content with consistent left padding */}
								<Box flexDirection="column" flexGrow={1} paddingLeft={0}>
									<Box>
										<Text
											bold={!message.read}
											color={
												isSelected
													? colors.white
													: !message.read
													? semanticColors.message.fromUnread
													: semanticColors.message.from
											}
											backgroundColor={
												isSelected ? semanticColors.folder.selected : undefined
											}
										>
											{message.from} - {message.date}
											{message.attachments &&
												message.attachments.length > 0 && (
													<Text
														color={
															isSelected
																? colors.white
																: semanticColors.message.threadIndicator
														}
													>
														{' '}
														📎
														{message.attachments.length > 1 &&
															` ${message.attachments.length}`}
													</Text>
												)}
											{message.threadCount && message.threadCount > 0 && (
												<Text
													color={
														isSelected
															? colors.white
															: semanticColors.message.threadIndicator
													}
												>
													{' '}
													💬 {message.threadCount}
												</Text>
											)}
										</Text>
									</Box>
									<Text
										bold={!message.read}
										color={
											isSelected ? colors.white : semanticColors.message.subject
										}
										backgroundColor={
											isSelected ? semanticColors.folder.selected : undefined
										}
									>
										{message.subject}
									</Text>
									<Text
										color={
											isSelected ? colors.white : semanticColors.message.preview
										}
										backgroundColor={
											isSelected ? semanticColors.folder.selected : undefined
										}
									>
										{message.preview}
										{message.threadCount && message.threadCount > 0 && (
											<Text
												color={
													isSelected
														? colors.white
														: semanticColors.message.threadIndicator
												}
											>
												{' '}
												(Thread)
											</Text>
										)}
									</Text>
								</Box>
							</Box>
						);
					})}

				{/* Scroll indicator - more messages below */}
				{viewportOffset + visibleItems < messages.length && (
					<Box marginTop={0}>
						<Text color={colors.gray} dimColor>
							▼ {messages.length - viewportOffset - visibleItems} more message
							{messages.length - viewportOffset - visibleItems > 1
								? 's'
								: ''}{' '}
							below
						</Text>
					</Box>
				)}
			</Box>
		</Box>
	);
};

export default MessageList;
