import Imap from 'node-imap';
import {simpleParser, ParsedMail} from 'mailparser';
import {
	EmailAccount,
	EmailMessage,
	EmailFolder,
	EmailAddress,
} from '../types/email.js';
import {OAuth2Service} from './oauth2Service.js';
import {AccountStorageService} from './accountStorageService.js';
import {debugLog, LogLevel} from '../utils/debug.js';

export class ImapService {
	private imap: Imap | null = null;
	private oauth2Service = new OAuth2Service();
	private accountStorage = new AccountStorageService();

	async connect(account: EmailAccount): Promise<void> {
		let config: Imap.Config;

		if (account.authType === 'oauth2' && account.oauth2Config) {
			// Get fresh access token
			let accessToken = account.oauth2Config.accessToken || '';

			// Check if token needs refresh
			if (
				account.oauth2Config.tokenExpiry &&
				new Date() >= account.oauth2Config.tokenExpiry
			) {
				if (account.oauth2Config.provider === 'google') {
					accessToken = await this.oauth2Service.refreshGoogleToken(
						account.oauth2Config,
					);
				} else {
					accessToken = await this.oauth2Service.refreshMicrosoftToken(
						account.oauth2Config,
					);
				}

				await this.accountStorage.updateTokens(account.id, accessToken);
			}

			const xoauth2 = this.buildXOAuth2String(account.email, accessToken);

			config = {
				user: account.email,
				xoauth2,
				password: '', // Required by types but not used with xoauth2
				host:
					account.imapConfig?.host ||
					(account.provider === 'gmail'
						? 'imap.gmail.com'
						: 'outlook.office365.com'),
				port: account.imapConfig?.port || 993,
				tls: true,
				tlsOptions: {rejectUnauthorized: false},
			};
		} else if (account.imapConfig) {
			// For IMAP, use the full email as username if no username is specified
			const username = account.imapConfig.username || account.email;

			config = {
				user: username,
				password: account.imapConfig.password || '',
				host: account.imapConfig.host,
				port: account.imapConfig.port,
				tls: account.imapConfig.secure,
				tlsOptions: {rejectUnauthorized: false},
				authTimeout: 10000,
				connTimeout: 10000,
			};

			debugLog(
				LogLevel.INFO,
				'ImapService',
				`Connecting to ${account.imapConfig.host} as ${username}...`,
			);
		} else {
			throw new Error('No authentication configuration found');
		}

		this.imap = new Imap(config);

		return new Promise((resolve, reject) => {
			this.imap!.once('ready', () => {
				debugLog(
					LogLevel.INFO,
					'ImapService',
					'IMAP connection established successfully',
				);
				resolve();
			});
			this.imap!.once('error', (err: Error) => {
				debugLog(
					LogLevel.ERROR,
					'ImapService',
					'IMAP connection error:',
					err.message,
				);
				if (
					err.message.includes('Access Denied') ||
					err.message.includes('authentication')
				) {
					reject(
						new Error(`Authentication failed. Please check:
1. Username (might need full email address)
2. Password is correct
3. IMAP access is enabled for your account
4. No 2FA/app-specific password required

Original error: ${err.message}`),
					);
				} else {
					reject(err);
				}
			});
			this.imap!.connect();
		});
	}

	async disconnect(): Promise<void> {
		return new Promise(resolve => {
			if (this.imap && this.imap.state === 'authenticated') {
				this.imap.end();
				this.imap.once('end', () => resolve());
			} else {
				resolve();
			}
		});
	}

	async getFolders(): Promise<EmailFolder[]> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.getBoxes((err, boxes) => {
				if (err) {
					reject(err);
					return;
				}

				const folders = this.parseBoxes(boxes);
				resolve(folders);
			});
		});
	}

	async getMessages(
		folder: string,
		limit: number = 50,
		sequenceRange?: string,
	): Promise<EmailMessage[]> {
		if (!this.imap) throw new Error('Not connected');

		const startTime = Date.now();
		debugLog(
			LogLevel.INFO,
			'ImapService',
			`getMessages START - folder: ${folder}, limit: ${limit}, range: ${sequenceRange}`,
		);

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, err => {
				if (err) {
					reject(err);
					return;
				}
				debugLog(
					LogLevel.INFO,
					'ImapService',
					`openBox completed in ${Date.now() - startTime}ms`,
				);

				// For paginated requests, use sequence fetch directly
				if (sequenceRange && sequenceRange.includes(':')) {
					const total = (this.imap as any)._box.messages.total || 0;

					debugLog(
						LogLevel.INFO,
						'ImapService',
						`Fetching messages by sequence range ${sequenceRange} from folder ${folder} (total: ${total})`,
					);

					// Use sequence-based fetching for all pages
					// This is much more efficient than fetching all messages
					this.fetchBySequence(
						folder,
						sequenceRange,
						messages => {
							// Sort by date descending for consistency
							messages.sort((a, b) => b.date.getTime() - a.date.getTime());

							debugLog(
								LogLevel.INFO,
								'ImapService',
								`Fetched ${messages.length} messages for sequence range ${sequenceRange}`,
							);

							// Log date range for debugging
							if (messages.length > 0) {
								const firstMsg = messages[0];
								const lastMsg = messages[messages.length - 1];
								if (firstMsg && lastMsg) {
									debugLog(
										LogLevel.INFO,
										'ImapService',
										`Messages date range: ${firstMsg.date} to ${lastMsg.date}`,
									);
								}
							}

							resolve(messages);
						},
						reject,
					);
				} else {
					// Use regular sequence-based fetching for non-paginated requests
					this.fetchBySequence(folder, sequenceRange, resolve, reject);
				}
			});
		});
	}

	// Keeping this method for potential future use when we need to fetch by UIDs
	// private fetchByUIDs(
	// 	_folder: string,
	// 	uids: number[],
	// 	resolve: (messages: EmailMessage[]) => void,
	// 	reject: (error: any) => void,
	// ): void {
	// 	const messages: EmailMessage[] = [];
	// 	let expectedMessages = 0;
	// 	let processedMessages = 0;
	// 	let fetchEnded = false;
	//
	// 		debugLog(LogLevel.INFO, 'ImapService', `fetchByUIDs: Fetching ${uids.length} messages by UID`);
	//
	// 		const checkCompletion = () => {
	// 			if (fetchEnded && processedMessages === expectedMessages) {
	// 				debugLog(LogLevel.INFO, 'ImapService', `fetchByUIDs completed: Got ${messages.length} messages out of ${expectedMessages} expected`);
	// 				resolve(messages);
	// 			}
	// 		};
	//
	// 		const fetch = this.imap!.fetch(uids, {
	// 			bodies: '',
	// 			struct: true,
	// 			envelope: true,
	// 		});
	//
	// 		fetch.on('message', msg => {
	// 			expectedMessages++;
	// 			let messageData: {
	// 				uid?: number;
	// 				envelope?: any;
	// 				attributes?: any;
	// 				body?: any;
	// 			} = {};
	//
	// 			msg.on('body', stream => {
	// 				let buffer = '';
	// 				stream.on('data', chunk => {
	// 					buffer += chunk.toString('utf8');
	// 				});
	// 				stream.once('end', () => {
	// 					messageData.body = buffer;
	// 					// Process message if we have all parts
	// 					if (messageData.attributes && messageData.body) {
	// 						processMessage();
	// 					}
	// 				});
	// 			});
	//
	// 			msg.on('attributes', (attrs: any) => {
	// 				messageData.uid = attrs.uid;
	// 				messageData.envelope = attrs.envelope;
	// 				messageData.attributes = attrs;
	// 				// Process message if we have all parts
	// 				if (messageData.body) {
	// 					processMessage();
	// 				}
	// 			});
	//
	// 			const processMessage = () => {
	// 				simpleParser(messageData.body, (err: any, parsed: ParsedMail) => {
	// 					processedMessages++;
	//
	// 					if (err) {
	// 						debugLog(LogLevel.ERROR, 'ImapService', 'Error parsing message:', err);
	// 						checkCompletion();
	// 						return;
	// 					}
	//
	// 					const emailMessage = this.parsedMailToEmailMessage(
	// 						parsed,
	// 						messageData.uid || 0,
	// 						messageData.envelope,
	// 						messageData.attributes || {},
	// 					);
	// 					emailMessage.accountId = '';
	// 					emailMessage.folder = '';
	// 					messages.push(emailMessage);
	//
	// 					// Log June 2025 messages specifically
	// 					const msgDate = new Date(emailMessage.date);
	// 					if (msgDate.getFullYear() === 2025 && msgDate.getMonth() === 5) {
	// 						debugLog(LogLevel.INFO, 'ImapService', `Found June 2025 message: "${emailMessage.subject}" on ${msgDate}`);
	// 					}
	//
	// 					checkCompletion();
	// 				});
	// 			};
	// 		});
	//
	// 		fetch.once('error', err => {
	// 			debugLog(LogLevel.ERROR, 'ImapService', 'fetchByUIDs error:', err);
	// 			reject(err);
	// 		});
	// 		fetch.once('end', () => {
	// 			fetchEnded = true;
	// 			debugLog(LogLevel.INFO, 'ImapService', `fetchByUIDs fetch ended: ${processedMessages}/${expectedMessages} messages processed`);
	// 			checkCompletion();
	// 		// });
	// }

	private fetchBySequence(
		folder: string,
		sequenceRange: string | undefined,
		resolve: (messages: EmailMessage[]) => void,
		reject: (error: any) => void,
	): void {
		const startTime = Date.now();
		const messages: EmailMessage[] = [];
		const fetchRange =
			sequenceRange ||
			Math.max(1, ((this.imap as any)._box.messages.total || 0) - 50 + 1) +
				':*';

		debugLog(
			LogLevel.INFO,
			'ImapService',
			`fetchBySequence: Fetching range ${fetchRange} from folder ${folder}`,
		);

		const fetch = this.imap!.seq.fetch(fetchRange, {
			bodies: '',  // Gets the full message including attachments
			struct: true,  // Gets the MIME structure
			envelope: true,
			markSeen: false,  // Don't mark as read when fetching
		});

		fetch.on('message', msg => {
			let messageData: {
				uid?: number;
				envelope?: any;
				attributes?: any;
				body?: any;
			} = {};

			msg.on('body', stream => {
				let buffer = '';
				stream.on('data', chunk => {
					buffer += chunk.toString('utf8');
				});
				stream.once('end', () => {
					messageData.body = buffer;
					// Process message if we have all parts
					if (messageData.attributes && messageData.body) {
						processMessage();
					}
				});
			});

			msg.on('attributes', (attrs: any) => {
				messageData.uid = attrs.uid;
				messageData.envelope = attrs.envelope;
				messageData.attributes = attrs;
				// Process message if we have all parts
				if (messageData.body) {
					processMessage();
				}
			});

			const processMessage = () => {
				simpleParser(messageData.body, (err: any, parsed: ParsedMail) => {
					if (err) {
						debugLog(
							LogLevel.ERROR,
							'ImapService',
							'Error parsing message:',
							err,
						);
						return;
					}

					const emailMessage = this.parsedMailToEmailMessage(
						parsed,
						messageData.uid || 0,
						messageData.envelope,
						messageData.attributes || {},
					);
					emailMessage.accountId = '';
					emailMessage.folder = '';
					messages.push(emailMessage);
				});
			};
		});

		fetch.once('error', err => {
			debugLog(LogLevel.ERROR, 'ImapService', 'fetchBySequence error:', err);
			reject(err);
		});
		fetch.once('end', () => {
			debugLog(
				LogLevel.INFO,
				'ImapService',
				`fetchBySequence completed: Got ${
					messages.length
				} messages from range ${fetchRange} in ${Date.now() - startTime}ms`,
			);
			resolve(messages);
		});
	}

	async getMessage(folder: string, uid: number): Promise<EmailMessage | null> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, err => {
				if (err) {
					reject(err);
					return;
				}

				let message: EmailMessage | null = null;

				const fetch = this.imap!.fetch(uid, {
					bodies: '',  // Gets the full message including attachments
					struct: true,  // Gets the MIME structure
					envelope: true,
					markSeen: false,  // Don't mark as read when fetching
				});

				fetch.on('message', msg => {
					let messageData: {
						uid?: number;
						envelope?: any;
						attributes?: any;
						body?: any;
					} = {};

					msg.on('body', stream => {
						let buffer = '';
						stream.on('data', chunk => {
							buffer += chunk.toString('utf8');
						});
						stream.once('end', () => {
							messageData.body = buffer;
							// Process message if we have all parts
							if (messageData.attributes && messageData.body) {
								processMessage();
							}
						});
					});

					msg.on('attributes', (attrs: any) => {
						messageData.uid = attrs.uid;
						messageData.envelope = attrs.envelope;
						messageData.attributes = attrs;
						// Process message if we have all parts
						if (messageData.body) {
							processMessage();
						}
					});

					const processMessage = () => {
						simpleParser(messageData.body, (err: any, parsed: ParsedMail) => {
							if (err) {
								debugLog(
									LogLevel.ERROR,
									'ImapService',
									'Error parsing message:',
									err,
								);
								return;
							}

							message = this.parsedMailToEmailMessage(
								parsed,
								messageData.uid || 0,
								messageData.envelope,
								messageData.attributes || {},
							);
						});
					};
				});

				fetch.once('error', err => reject(err));
				fetch.once('end', () => resolve(message));
			});
		});
	}

	async markAsRead(folder: string, uid: number): Promise<void> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, false, err => {
				if (err) {
					reject(err);
					return;
				}

				this.imap!.addFlags(uid, ['\\Seen'], err => {
					if (err) reject(err);
					else resolve();
				});
			});
		});
	}

	async deleteMessage(folder: string, uid: number): Promise<void> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, false, err => {
				if (err) {
					reject(err);
					return;
				}

				this.imap!.addFlags(uid, ['\\Deleted'], err => {
					if (err) {
						reject(err);
						return;
					}

					this.imap!.expunge(err => {
						if (err) reject(err);
						else resolve();
					});
				});
			});
		});
	}

	async getFolderStatus(
		folder: string,
	): Promise<{total: number; unseen: number}> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, (err, box) => {
				if (err) {
					reject(err);
					return;
				}

				// Search for ALL messages to get accurate count (handles deleted messages)
				this.imap!.search(['ALL'], (searchErr, allResults) => {
					if (searchErr) {
						// Fallback to box total if search fails
						const total = box.messages.total || 0;
						resolve({
							total,
							unseen: box.messages.new || 0,
						});
						return;
					}

					// Get actual count of existing messages
					const actualTotal = allResults ? allResults.length : 0;
					debugLog(
						LogLevel.INFO,
						'ImapService',
						`getFolderStatus: Found ${actualTotal} actual messages (box reports ${box.messages.total})`,
					);

					// Search for unseen messages
					this.imap!.search(['UNSEEN'], (unseenErr, unseenResults) => {
						if (unseenErr) {
							resolve({
								total: actualTotal,
								unseen: box.messages.new || 0,
							});
							return;
						}

						const unseen = unseenResults ? unseenResults.length : 0;
						resolve({
							total: actualTotal,
							unseen,
						});
					});
				});
			});
		});
	}

	async getThreadMessages(
		folder: string,
		messageId: string,
		references: string[],
	): Promise<EmailMessage[]> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, async err => {
				if (err) {
					reject(err);
					return;
				}

				try {
					// For thread searching, we'll do multiple searches and combine results
					const allMessageIds = new Set<number>();

					// Helper function to search and add results
					const searchAndAdd = (criteria: any[]): Promise<void> => {
						return new Promise(searchResolve => {
							this.imap!.search(criteria, (err, results) => {
								if (!err && results) {
									results.forEach(id => allMessageIds.add(id));
								}
								searchResolve();
							});
						});
					};

					// Search for the original message
					if (messageId) {
						const cleanMessageId = messageId.replace(/^<|>$/g, '');
						await searchAndAdd([['HEADER', 'MESSAGE-ID', cleanMessageId]]);
						await searchAndAdd([['HEADER', 'REFERENCES', cleanMessageId]]);
						await searchAndAdd([['HEADER', 'IN-REPLY-TO', cleanMessageId]]);
					}

					// Search for messages that reference any of the references
					if (references && references.length > 0) {
						for (const ref of references) {
							const cleanRef = ref.replace(/^<|>$/g, '');
							await searchAndAdd([['HEADER', 'MESSAGE-ID', cleanRef]]);
							await searchAndAdd([['HEADER', 'REFERENCES', cleanRef]]);
						}
					}

					// Convert Set to array and sort
					const results = Array.from(allMessageIds).sort((a, b) => a - b);

					if (results.length === 0) {
						resolve([]);
						return;
					}

					// Fetch all the messages
					const messages: EmailMessage[] = [];
					const fetch = this.imap!.seq.fetch(results, {
						bodies: '',  // Gets the full message including attachments
						struct: true,  // Gets the MIME structure
						envelope: true,
						markSeen: false,  // Don't mark as read when fetching
					});

					fetch.on('message', msg => {
						let messageData: any = {};

						msg.on('body', stream => {
							let buffer = '';
							stream.on('data', chunk => {
								buffer += chunk.toString('utf8');
							});
							stream.once('end', () => {
								messageData.body = buffer;
								if (messageData.attributes) {
									processMessage();
								}
							});
						});

						msg.on('attributes', (attrs: any) => {
							messageData.uid = attrs.uid;
							messageData.envelope = attrs.envelope;
							messageData.attributes = attrs;
							if (messageData.body) {
								processMessage();
							}
						});

						const processMessage = () => {
							simpleParser(messageData.body, (err: any, parsed: ParsedMail) => {
								if (err) {
									debugLog(
										LogLevel.ERROR,
										'ImapService',
										'Error parsing thread message:',
										err,
									);
									return;
								}

								const message = this.parsedMailToEmailMessage(
									parsed,
									messageData.uid || 0,
									messageData.envelope,
									messageData.attributes || {},
								);
								message.accountId = '';
								message.folder = folder;
								messages.push(message);
							});
						};
					});

					fetch.once('end', () => {
						// Sort messages by date
						messages.sort((a, b) => a.date.getTime() - b.date.getTime());
						resolve(messages);
					});

					fetch.once('error', err => {
						debugLog(LogLevel.ERROR, 'ImapService', 'Fetch error:', err);
						resolve([]);
					});
				} catch (error) {
					debugLog(LogLevel.ERROR, 'ImapService', 'Thread fetch error:', error);
					resolve([]);
				}
			});
		});
	}

	private buildXOAuth2String(email: string, accessToken: string): string {
		const authString = [
			`user=${email}`,
			`auth=Bearer ${accessToken}`,
			'',
			'',
		].join('\x01');

		return Buffer.from(authString).toString('base64');
	}

	private parseBoxes(boxes: any, parentPath: string = ''): EmailFolder[] {
		const folders: EmailFolder[] = [];

		for (const [name, box] of Object.entries(boxes) as [string, any][]) {
			const folder: EmailFolder = {
				name: parentPath ? `${parentPath}${box.delimiter}${name}` : name,
				displayName: name,
				delimiter: box.delimiter,
				specialUse: box.special_use_attrib,
			};

			if (box.children) {
				folder.children = this.parseBoxes(box.children, folder.name);
			}

			folders.push(folder);
		}

		return folders;
	}

	private parseAddresses(addresses: any): EmailAddress[] {
		if (!addresses) return [];

		if (Array.isArray(addresses)) {
			return addresses.map((addr: any) => ({
				name: addr.name,
				address: addr.address || '',
			}));
		}

		if (addresses.value) {
			return addresses.value.map((addr: any) => ({
				name: addr.name,
				address: addr.address || '',
			}));
		}

		return [];
	}

	private parsedMailToEmailMessage(
		parsed: ParsedMail,
		uid: number,
		_envelope: any,
		attributes: any,
	): EmailMessage {
		// Ensure attributes is an object
		const attrs = attributes || {};

		// Debug log for attachments
		if (parsed.attachments && parsed.attachments.length > 0) {
			debugLog(
				LogLevel.INFO,
				'ImapService',
				`Message UID ${uid} has ${parsed.attachments.length} attachments:`,
				parsed.attachments.map((att: any) => ({
					filename: att.filename,
					contentType: att.contentType,
					size: att.size,
				})),
			);
		}

		return {
			id: parsed.messageId || `${uid}`,
			accountId: '', // Will be set by the caller
			folder: '', // Will be set by the caller
			uid,
			messageId: parsed.messageId || '',
			from: this.parseAddresses(parsed.from),
			to: this.parseAddresses(parsed.to),
			cc: this.parseAddresses(parsed.cc),
			bcc: this.parseAddresses(parsed.bcc),
			subject: parsed.subject || '',
			date: parsed.date || new Date(),
			body: {
				text: parsed.text || undefined,
				html: parsed.html || undefined,
			},
			attachments: parsed.attachments?.map((att: any) => ({
				filename: att.filename || '',
				contentType: att.contentType,
				size: att.size,
				contentId: att.contentId,
				content: att.content,
			})),
			flags: attrs.flags || [],
			threadId: parsed.inReplyTo || undefined,
			inReplyTo: parsed.inReplyTo || undefined,
			references: parsed.references
				? Array.isArray(parsed.references)
					? parsed.references
					: [parsed.references]
				: undefined,
		};
	}
}
