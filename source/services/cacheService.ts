import Database from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {EmailMessage} from '../types/email.js';
import {debugLog, LogLevel} from '../utils/debug.js';

interface CachedMessage {
	id: number;
	uid: number;
	folder_id: string;
	account_id: string;
	subject: string;
	from_name: string;
	from_address: string;
	date: number;
	flags: string;
	preview: string;
	has_attachments: boolean;
	thread_count: number;
	last_fetched: number;
}

interface CachedAttachment {
	filename: string;
	content_type: string;
	size: number;
	content_id: string | null;
}

// interface CachedFolder {
// 	id: string;
// 	account_id: string;
// 	name: string;
// 	last_sync: number;
// 	total_count: number;
// 	unread_count: number;
// }

export class CacheService {
	private db: Database.Database | null = null;
	private readonly cacheDir: string;
	private readonly dbPath: string;

	constructor() {
		// Use ~/.chaski/cache directory
		this.cacheDir = path.join(os.homedir(), '.chaski', 'cache');
		this.dbPath = path.join(this.cacheDir, 'messages.db');
		this.initializeDatabase();
	}

	private initializeDatabase(): void {
		try {
			// Create cache directory if it doesn't exist
			if (!fs.existsSync(this.cacheDir)) {
				fs.mkdirSync(this.cacheDir, {recursive: true, mode: 0o700});
				debugLog(
					LogLevel.INFO,
					'CacheService',
					`Created cache directory: ${this.cacheDir}`,
				);
			}

			// Initialize SQLite database
			this.db = new Database(this.dbPath);
			debugLog(
				LogLevel.INFO,
				'CacheService',
				`Opened cache database: ${this.dbPath}`,
			);

			// Set file permissions to 0600 (owner read/write only)
			fs.chmodSync(this.dbPath, 0o600);

			// Enable Write-Ahead Logging for better performance
			this.db.pragma('journal_mode = WAL');
			this.db.pragma('synchronous = NORMAL');

			// Create tables if they don't exist
			this.createTables();
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to initialize database:',
				error,
			);
			// Continue without cache if initialization fails
			this.db = null;
		}
	}

	private createTables(): void {
		if (!this.db) return;

		// Messages table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS messages (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				uid INTEGER NOT NULL,
				folder_id TEXT NOT NULL,
				account_id TEXT NOT NULL,
				subject TEXT,
				from_name TEXT,
				from_address TEXT,
				date INTEGER NOT NULL,
				flags TEXT,
				preview TEXT,
				has_attachments INTEGER DEFAULT 0,
				thread_count INTEGER DEFAULT 0,
				last_fetched INTEGER NOT NULL,
				UNIQUE(uid, folder_id, account_id)
			);

			CREATE INDEX IF NOT EXISTS idx_messages_folder ON messages(folder_id, account_id);
			CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date DESC);
			CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_name, from_address);
		`);

		// Folders table
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS folders (
				id TEXT PRIMARY KEY,
				account_id TEXT NOT NULL,
				name TEXT NOT NULL,
				last_sync INTEGER,
				total_count INTEGER DEFAULT 0,
				unread_count INTEGER DEFAULT 0
			);

			CREATE INDEX IF NOT EXISTS idx_folders_account ON folders(account_id);
		`);

		// Message bodies table (optional, for caching full content)
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS message_bodies (
				message_id INTEGER PRIMARY KEY,
				text_content TEXT,
				html_content TEXT,
				cached_at INTEGER NOT NULL,
				FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
			);
		`);

		// Attachments table to store attachment details
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS attachments (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				message_uid INTEGER NOT NULL,
				folder_id TEXT NOT NULL,
				account_id TEXT NOT NULL,
				filename TEXT NOT NULL,
				content_type TEXT,
				size INTEGER,
				content_id TEXT,
				FOREIGN KEY (message_uid, folder_id, account_id) REFERENCES messages(uid, folder_id, account_id) ON DELETE CASCADE
			);

			CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_uid, folder_id, account_id);
		`);

		debugLog(LogLevel.INFO, 'CacheService', 'Database tables created/verified');
	}

	// Get cached messages for a folder
	async getCachedMessages(
		folderId: string,
		accountId: string,
		limit: number = 50,
		offset: number = 0,
	): Promise<EmailMessage[]> {
		if (!this.db) return [];

		try {
			const stmt = this.db.prepare(`
				SELECT * FROM messages
				WHERE folder_id = ? AND account_id = ?
				ORDER BY date DESC
				LIMIT ? OFFSET ?
			`);

			const rows = stmt.all(
				folderId,
				accountId,
				limit,
				offset,
			) as CachedMessage[];

			// Get attachments for each message
			const attachmentStmt = this.db.prepare(`
				SELECT filename, content_type, size, content_id
				FROM attachments
				WHERE message_uid = ? AND folder_id = ? AND account_id = ?
			`);

			return rows.map(row => {
				const attachments = attachmentStmt.all(
					row.uid,
					folderId,
					accountId,
				) as CachedAttachment[];

				return this.cachedMessageToEmailMessage(row, attachments);
			});
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to get cached messages:',
				error,
			);
			return [];
		}
	}

	// Update messages in cache
	async updateMessages(
		messages: EmailMessage[],
		folderId: string,
		accountId: string,
	): Promise<void> {
		if (!this.db) return;

		const insertStmt = this.db.prepare(`
			INSERT OR REPLACE INTO messages (
				uid, folder_id, account_id, subject, from_name, from_address,
				date, flags, preview, has_attachments, thread_count, last_fetched
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`);

		// Prepare statement for inserting attachments
		const insertAttachmentStmt = this.db.prepare(`
			INSERT OR REPLACE INTO attachments (
				message_uid, folder_id, account_id, filename, content_type, size, content_id
			) VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		// Delete existing attachments for these messages before inserting new ones
		const deleteAttachmentsStmt = this.db.prepare(`
			DELETE FROM attachments WHERE message_uid = ? AND folder_id = ? AND account_id = ?
		`);

		const transaction = this.db.transaction((messages: EmailMessage[]) => {
			const now = Date.now();
			for (const msg of messages) {
				const fromEmail = msg.from[0];
				const preview = msg.body.text
					? msg.body.text.substring(0, 200).replace(/\n/g, ' ').trim()
					: '';

				insertStmt.run(
					msg.uid,
					folderId,
					accountId,
					msg.subject || '(No subject)',
					fromEmail?.name || '',
					fromEmail?.address || '',
					new Date(msg.date).getTime(),
					msg.flags.join(','),
					preview,
					msg.attachments && msg.attachments.length > 0 ? 1 : 0,
					msg.references ? msg.references.length : 0,
					now,
				);

				// First, delete existing attachments for this message
				deleteAttachmentsStmt.run(msg.uid, folderId, accountId);

				// Then insert new attachments if any
				if (msg.attachments && msg.attachments.length > 0) {
					for (const attachment of msg.attachments) {
						insertAttachmentStmt.run(
							msg.uid,
							folderId,
							accountId,
							attachment.filename || 'unnamed',
							attachment.contentType || 'application/octet-stream',
							attachment.size || 0,
							attachment.contentId || null,
						);
					}
				}
			}
		});

		try {
			transaction(messages);
			debugLog(
				LogLevel.INFO,
				'CacheService',
				`Updated ${messages.length} messages in cache`,
			);
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to update messages:',
				error,
			);
		}
	}

	// Get last sync time for a folder
	async getLastSyncTime(
		folderId: string,
		accountId: string,
	): Promise<Date | null> {
		if (!this.db) return null;

		try {
			const stmt = this.db.prepare(`
				SELECT MAX(last_fetched) as last_sync FROM messages 
				WHERE folder_id = ? AND account_id = ?
			`);

			const result = stmt.get(folderId, accountId) as {
				last_sync: number | null;
			};
			return result.last_sync ? new Date(result.last_sync) : null;
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to get last sync time:',
				error,
			);
			return null;
		}
	}

	// Update folder metadata
	async updateFolderMetadata(
		folderId: string,
		accountId: string,
		totalCount: number,
		unreadCount: number,
	): Promise<void> {
		if (!this.db) return;

		try {
			const stmt = this.db.prepare(`
				INSERT OR REPLACE INTO folders (id, account_id, name, last_sync, total_count, unread_count)
				VALUES (?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				`${accountId}:${folderId}`,
				accountId,
				folderId,
				Date.now(),
				totalCount,
				unreadCount,
			);
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to update folder metadata:',
				error,
			);
		}
	}

	// Clear cache for a specific folder
	async clearFolder(folderId: string, accountId: string): Promise<void> {
		if (!this.db) return;

		try {
			const stmt = this.db.prepare(`
				DELETE FROM messages WHERE folder_id = ? AND account_id = ?
			`);
			stmt.run(folderId, accountId);
			debugLog(
				LogLevel.INFO,
				'CacheService',
				`Cleared cache for folder ${folderId}`,
			);
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to clear folder cache:',
				error,
			);
		}
	}

	// Clear all cache
	async clearAllCache(): Promise<void> {
		if (!this.db) return;

		try {
			this.db.exec('DELETE FROM messages');
			this.db.exec('DELETE FROM folders');
			this.db.exec('DELETE FROM message_bodies');
			debugLog(LogLevel.INFO, 'CacheService', 'Cleared all cache');
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to clear all cache:',
				error,
			);
		}
	}

	// Get cache statistics
	async getCacheStats(): Promise<{
		totalMessages: number;
		totalSize: number;
		oldestMessage: Date | null;
	}> {
		if (!this.db) {
			return {totalMessages: 0, totalSize: 0, oldestMessage: null};
		}

		try {
			const countStmt = this.db.prepare(
				'SELECT COUNT(*) as count FROM messages',
			);
			const oldestStmt = this.db.prepare(
				'SELECT MIN(last_fetched) as oldest FROM messages',
			);

			const count = (countStmt.get() as {count: number}).count;
			const oldest = (oldestStmt.get() as {oldest: number | null}).oldest;

			// Get database file size
			const stats = fs.statSync(this.dbPath);

			return {
				totalMessages: count,
				totalSize: stats.size,
				oldestMessage: oldest ? new Date(oldest) : null,
			};
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to get cache stats:',
				error,
			);
			return {totalMessages: 0, totalSize: 0, oldestMessage: null};
		}
	}

	// Convert cached message to EmailMessage format
	private cachedMessageToEmailMessage(
		cached: CachedMessage,
		attachments?: CachedAttachment[],
	): EmailMessage {
		return {
			id: cached.uid.toString(),
			accountId: cached.account_id,
			folder: cached.folder_id,
			uid: cached.uid,
			messageId: '',
			from: [
				{
					name: cached.from_name || undefined,
					address: cached.from_address,
				},
			],
			to: [],
			cc: [],
			bcc: [],
			subject: cached.subject,
			date: new Date(cached.date),
			body: {
				text: cached.preview,
			},
			attachments:
				attachments && attachments.length > 0
					? attachments.map(att => ({
							filename: att.filename,
							contentType: att.content_type,
							size: att.size,
							contentId: att.content_id || undefined,
					  }))
					: undefined,
			flags: cached.flags ? cached.flags.split(',') : [],
			references: cached.thread_count > 0 ? [] : undefined,
		};
	}

	// Get folder metadata from cache
	async getFolderMetadata(
		folderId: string,
		accountId: string,
	): Promise<{totalMessages: number; unreadCount: number} | null> {
		if (!this.db) return null;

		try {
			const stmt = this.db.prepare(`
				SELECT total_count, unread_count 
				FROM folders 
				WHERE id = ?
			`);
			const row = stmt.get(`${accountId}:${folderId}`) as
				| {total_count: number; unread_count: number}
				| undefined;

			if (row) {
				return {
					totalMessages: row.total_count,
					unreadCount: row.unread_count,
				};
			}
			return null;
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to get folder metadata:',
				error,
			);
			return null;
		}
	}

	// Update message flags in cache
	async updateMessageFlags(
		uid: string,
		folderId: string,
		accountId: string,
		flags: string[],
	): Promise<void> {
		if (!this.db) return;

		try {
			const stmt = this.db.prepare(`
				UPDATE messages 
				SET flags = ?
				WHERE uid = ? AND folder_id = ? AND account_id = ?
			`);

			stmt.run(flags.join(','), uid, folderId, accountId);
			debugLog(
				LogLevel.DEBUG,
				'CacheService',
				`Updated flags for message ${uid} in ${folderId}`,
			);
		} catch (error) {
			debugLog(
				LogLevel.ERROR,
				'CacheService',
				'Failed to update message flags:',
				error,
			);
		}
	}

	// Close database connection
	close(): void {
		if (this.db) {
			this.db.close();
			this.db = null;
			debugLog(LogLevel.INFO, 'CacheService', 'Database connection closed');
		}
	}
}
