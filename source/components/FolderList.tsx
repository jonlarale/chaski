import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import type {EmailService} from '../services/emailService.js';
import type {EmailAccount, EmailFolder} from '../types/email.js';
import {useDebug} from '../utils/debug.js';
import {colors, semanticColors, spacing} from '../constants/index.js';

// Format count for display (99+ for large numbers)
const formatCount = (count: number): string => {
	if (count > 99) return '99+';
	return count.toString();
};

type FolderListProps = {
	readonly onSelect: (folder: string, account?: string) => void;
	readonly onExpand: (expanded: boolean) => void; // To notify when a folder expands/collapses
	readonly hasFocus: boolean;
	readonly selectedFolder: string;
	readonly selectedAccount?: string;
	readonly width?: number;
	readonly emailService: EmailService;
	readonly emailAccounts: EmailAccount[];
};

type AccountWithCount = {
	account: EmailAccount;
	count: number;
	originalFolderName: string;
};

type FolderData = {
	name: string;
	label: string;
	accounts: AccountWithCount[];
	expanded: boolean;
};

// Map standard folder names to labels with icons
const folderLabels: Record<string, string> = {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	INBOX: '📥 All Inboxes',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	SENT: '📤 All Sent',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	DRAFTS: '📝 All Drafts',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	SPAM: '🚫 All Spam',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	JUNK: '🚫 All Spam',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	TRASH: '🗑️ All Trash',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	DELETED: '🗑️ All Trash',
	// eslint-disable-next-line @typescript-eslint/naming-convention
	ARCHIVE: '📦 All Archive',
};

// Get a display label for a folder
const getFolderLabel = (folderName: string): string => {
	const upperName = folderName.toUpperCase();
	return folderLabels[upperName] ?? `📁 ${folderName}`;
};

// Normalize folder names to handle different provider conventions
const normalizeFolderName = (folderName: string): string => {
	const upper = folderName.toUpperCase();
	switch (upper) {
		case 'SENT MAIL':
		case 'SENT MESSAGES':
		case 'SENT ITEMS': {
			return 'SENT';
		}

		case 'DELETED MESSAGES':
		case 'DELETED ITEMS': {
			return 'DELETED';
		}

		case 'JUNK E-MAIL':
		case 'JUNK MAIL': {
			return 'JUNK';
		}

		default: {
			return upper;
		}
	}
};

function FolderList({
	onSelect,
	onExpand,
	hasFocus,
	selectedFolder,
	selectedAccount,
	width = 20,
	emailService,
	emailAccounts,
}: FolderListProps) {
	const debug = useDebug('FolderList');
	const [foldersState, setFoldersState] = useState<FolderData[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | undefined>(undefined);
	const [rootHoveredIndex, setRootHoveredIndex] = useState(0); // Index for root folders
	const [accountHoveredIndex, setAccountHoveredIndex] = useState(0); // Index for sub-accounts
	const [navigationMode, setNavigationMode] = useState<'root' | 'accounts'>(
		'root',
	); // Navigation mode

	// Load folders for all accounts
	useEffect(() => {
		const loadFolders = async () => {
			if (emailAccounts.length === 0) {
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				setError(undefined);

				// Load folders for each account
				const folderPromises = emailAccounts.map(async account => {
					try {
						const folders = await emailService.getFolders(account.id);
						return {accountId: account.id, folders};
					} catch (error_: unknown) {
						console.error(
							`Failed to load folders for ${account.email}:`,
							error_,
						);
						return {accountId: account.id, folders: [] as EmailFolder[]};
					}
				});

				const results = await Promise.all(folderPromises);
				const folderMap: Record<string, EmailFolder[]> = {};
				for (const {accountId, folders} of results) {
					folderMap[accountId] = folders;
				}

				// Group folders by name across accounts
				const folderGroups = new Map<string, AccountWithCount[]>();

				// Collect all INBOX status requests to run in parallel
				const inboxStatusPromises: Array<
					Promise<{
						accountId: string;
						folderName: string;
						unseen: number;
					}>
				> = [];

				for (const account of emailAccounts) {
					const accountFolders = folderMap[account.id] ?? [];

					for (const folder of accountFolders) {
						// Normalize folder names to handle different conventions
						const normalizedName = normalizeFolderName(folder.name);

						if (!folderGroups.has(normalizedName)) {
							folderGroups.set(normalizedName, []);
						}

						// Queue INBOX status requests to run in parallel
						if (normalizedName === 'INBOX') {
							inboxStatusPromises.push(
								emailService
									.getFolderStatus(account.id, folder.name)
									.then(status => ({
										accountId: account.id,
										folderName: folder.name,
										unseen: status.unseen,
									}))
									.catch((error_: unknown) => {
										console.error(
											`Failed to get folder status for ${account.email}/${folder.name}:`,
											error_,
										);
										return {
											accountId: account.id,
											folderName: folder.name,
											unseen: 0,
										};
									}),
							);
						}
					}
				}

				// Run all INBOX status requests in parallel
				const inboxStatuses = await Promise.all(inboxStatusPromises);
				const statusMap = new Map(
					inboxStatuses.map(s => [`${s.accountId}:${s.folderName}`, s.unseen]),
				);

				// Now build the folder groups with the status data
				for (const account of emailAccounts) {
					const accountFolders = folderMap[account.id] ?? [];

					for (const folder of accountFolders) {
						// Normalize folder names to handle different conventions
						const normalizedName = normalizeFolderName(folder.name);

						// Get unread count from our parallel fetch results
						const unreadCount =
							normalizedName === 'INBOX'
								? statusMap.get(`${account.id}:${folder.name}`) ?? 0
								: 0;

						folderGroups.get(normalizedName)!.push({
							account,
							count: unreadCount,
							originalFolderName: folder.name,
						});
					}
				}

				// Convert to folder data array, prioritizing standard folders
				const standardFolders = [
					'INBOX',
					'SENT',
					'DRAFTS',
					'SPAM',
					'JUNK',
					'TRASH',
					'DELETED',
					'ARCHIVE',
				];
				const folderData: FolderData[] = [];

				// Add standard folders first
				for (const folderName of standardFolders) {
					if (folderGroups.has(folderName)) {
						folderData.push({
							name: folderName,
							label: getFolderLabel(folderName),
							accounts: folderGroups.get(folderName)!,
							expanded: false,
						});
					}
				}

				// Add any other folders
				for (const [folderName, accounts] of folderGroups) {
					if (!standardFolders.includes(folderName)) {
						folderData.push({
							name: folderName,
							label: getFolderLabel(folderName),
							accounts,
							expanded: false,
						});
					}
				}

				setFoldersState(folderData);
			} catch (error_: unknown) {
				setError(
					error_ instanceof Error ? error_.message : 'Failed to load folders',
				);
			} finally {
				setLoading(false);
			}
		};

		void loadFolders();
	}, [emailService, emailAccounts]);

	// Helper function to truncate text
	const truncateText = (text: string, maxLength: number) => {
		if (text.length <= maxLength) return text;
		return text.slice(0, maxLength - 3) + '...';
	};

	// Calculate available width for account text
	const accountTextWidth = width - 8; // Account for margins, indentation and icons

	// Get currently expanded folder
	// const expandedFolder = foldersState.find(f => f.expanded);

	useInput((_input, key) => {
		// Only process input if this component has focus
		if (!hasFocus) return;

		if (navigationMode === 'root') {
			// Navigation in root folders
			if (key.upArrow && rootHoveredIndex > 0) {
				setRootHoveredIndex(rootHoveredIndex - 1);
			}

			if (key.downArrow && rootHoveredIndex < foldersState.length - 1) {
				setRootHoveredIndex(rootHoveredIndex + 1);
			}

			if (key.return || key.rightArrow) {
				// Enter or → to expand folder
				const targetFolder = foldersState[rootHoveredIndex];
				if (targetFolder) {
					const wasExpanded = targetFolder.expanded;
					debug.info('Toggling folder expansion', {
						folder: targetFolder.name,
						wasExpanded,
					});

					setFoldersState(previous =>
						previous.map(folder => ({
							...folder,
							// Only keep selected folder expanded
							expanded:
								folder.name === targetFolder.name ? !folder.expanded : false,
						})),
					);

					// If we're going to expand a folder (not collapse), change to accounts mode
					if (!wasExpanded) {
						setNavigationMode('accounts');
						setAccountHoveredIndex(0);
					}

					// Notify expansion
					onExpand(!wasExpanded);
				}
			}

			// ← does nothing in root mode (we're already at leftmost level)
		} else if (navigationMode === 'accounts') {
			// Navigation in sub-accounts - use current foldersState
			const currentExpandedFolder = foldersState.find(f => f.expanded);

			if (currentExpandedFolder) {
				if (key.upArrow && accountHoveredIndex > 0) {
					setAccountHoveredIndex(accountHoveredIndex - 1);
				}

				if (
					key.downArrow &&
					accountHoveredIndex < currentExpandedFolder.accounts.length - 1
				) {
					setAccountHoveredIndex(accountHoveredIndex + 1);
				}

				if (key.return || key.rightArrow) {
					// Enter or → to select specific account
					const selectedAccountData =
						currentExpandedFolder.accounts[accountHoveredIndex];
					if (selectedAccountData) {
						onSelect(
							selectedAccountData.originalFolderName,
							selectedAccountData.account.email,
						);
					}
				}

				if (key.leftArrow) {
					// ← to go back to root mode and collapse folders
					setNavigationMode('root');
					setFoldersState(previous =>
						previous.map(folder => ({
							...folder,
							expanded: false,
						})),
					);

					// Notify collapse
					onExpand(false);
				}
			}
		}
	});

	// Show loading state
	if (loading) {
		return (
			<Box flexDirection="column" padding={spacing.folder.padding}>
				<Text bold color={colors.gray}>
					📁 Loading folders...
				</Text>
			</Box>
		);
	}

	// Show error state
	if (error) {
		return (
			<Box flexDirection="column" padding={spacing.folder.padding}>
				<Text bold color={colors.red}>
					📁 Error: {error}
				</Text>
			</Box>
		);
	}

	// Show empty state if no accounts
	if (emailAccounts.length === 0) {
		return (
			<Box flexDirection="column" padding={spacing.folder.padding}>
				<Text bold color={colors.gray}>
					📁 No accounts configured
				</Text>
				<Text color={colors.gray}>Use /add-account to add one</Text>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={spacing.folder.padding}>
			<Text bold color={hasFocus ? semanticColors.folder.header : colors.gray}>
				📁 Folders
			</Text>
			<Box flexDirection="column" marginTop={spacing.marginSm}>
				{foldersState.map((folder, folderIndex) => (
					<React.Fragment key={folder.name}>
						{/* Root folder */}
						<Box marginBottom={0}>
							<Text
								backgroundColor={
									navigationMode === 'root' &&
									folderIndex === rootHoveredIndex &&
									hasFocus
										? semanticColors.folder.selected
										: undefined
								}
								bold={
									navigationMode === 'root' &&
									folderIndex === rootHoveredIndex &&
									hasFocus
								}
								color={
									navigationMode === 'root' &&
									folderIndex === rootHoveredIndex &&
									hasFocus
										? colors.white
										: semanticColors.folder.text
								}
							>
								{folder.expanded ? '▼ ' : '▶ '}
								{folder.label}
							</Text>
						</Box>

						{/* Sub-accounts (only if expanded) */}
						{folder.expanded && (
							<Box
								flexDirection="column"
								marginLeft={spacing.folder.accountIndent}
							>
								{folder.accounts.map((accountData, accountIndex) => {
									const isSelected =
										(folder.name === selectedFolder ||
											accountData.originalFolderName === selectedFolder) &&
										accountData.account.email === selectedAccount;
									const isHovered =
										navigationMode === 'accounts' &&
										accountIndex === accountHoveredIndex &&
										hasFocus;

									return (
										<Box key={accountData.account.email} marginBottom={0}>
											<Text
												backgroundColor={
													isHovered ? semanticColors.folder.selected : undefined
												}
												bold={isSelected || isHovered}
												color={
													isSelected
														? colors.green
														: isHovered
														? colors.white
														: colors.gray
												}
											>
												{isSelected ? '→ ' : '  '}
												{(() => {
													const {email} = accountData.account;
													const countString = accountData.count > 0 ? ` ` : '';
													const fullText = `${email}${countString}`;

													// If text needs truncation, truncate email but keep count
													if (fullText.length > accountTextWidth) {
														const availableWidth =
															accountTextWidth - countString.length - 5; // Extra space for count
														const truncatedEmail = truncateText(
															email,
															availableWidth,
														);
														return truncatedEmail;
													}

													return email;
												})()}
												{accountData.count > 0 && (
													<Text bold color={colors.white}>
														{' '}
														({formatCount(accountData.count)})
													</Text>
												)}
											</Text>
										</Box>
									);
								})}
							</Box>
						)}
					</React.Fragment>
				))}
			</Box>
		</Box>
	);
}

export default FolderList;
