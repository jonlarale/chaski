import {Buffer} from 'node:buffer';
import Imap from 'node-imap';
import {simpleParser} from 'mailparser';
import type {ParsedMail} from 'mailparser';
import {debugLog, LogLevel} from '../utils/debug-core.js';
import type {
	EmailAccount,
	EmailMessage,
	EmailFolder,
	EmailAddress,
} from '../types/email.js';
import {OAuth2Service} from './oauth2Service.js';
import {AccountStorageService} from './accountStorageService.js';

type MessageData = {
	uid?: number;
	envelope?: any;
	attributes?: any;
	body?: any;
};

export class ImapService {
	private imap: Imap | undefined = undefined;
	private readonly oauth2Service = new OAuth2Service();
	private readonly accountStorage = new AccountStorageService();

	async connect(account: EmailAccount): Promise<void> {
		let config: Imap.Config;

		if (account.authType === 'oauth2' && account.oauth2Config) {
			// Get fresh access token
			let accessToken = account.oauth2Config.accessToken ?? '';

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

			const xoauth2 = this.buildXoauth2String(account.email, accessToken);

			config = {
				user: account.email,
				xoauth2,
				password: '', // Required by types but not used with xoauth2
				host:
					account.imapConfig?.host ??
					(account.provider === 'gmail'
						? 'imap.gmail.com'
						: 'outlook.office365.com'),
				port: account.imapConfig?.port ?? 993,
				tls: true,
				tlsOptions: {rejectUnauthorized: false},
			};
		} else if (account.imapConfig) {
			// For IMAP, use the full email as username if no username is specified
			const username = account.imapConfig.username ?? account.email;

			config = {
				user: username,
				password: account.imapConfig.password ?? '',
				host: account.imapConfig.host,
				port: account.imapConfig.port,
				tls: account.imapConfig.secure,
				tlsOptions: {rejectUnauthorized: false},
				authTimeout: 10_000,
				connTimeout: 10_000,
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
			this.imap!.once('error', (error: Error) => {
				debugLog(
					LogLevel.ERROR,
					'ImapService',
					'IMAP connection error:',
					error.message,
				);
				if (
					error.message.includes('Access Denied') ||
					error.message.includes('authentication')
				) {
					reject(
						new Error(`Authentication failed. Please check:
1. Username (might need full email address)
2. Password is correct
3. IMAP access is enabled for your account
4. No 2FA/app-specific password required

Original error: ${error.message}`),
					);
				} else {
					reject(error);
				}
			});
			this.imap!.connect();
		});
	}

	async disconnect(): Promise<void> {
		return new Promise(resolve => {
			if (this.imap?.state === 'authenticated') {
				this.imap.end();
				this.imap.once('end', () => {
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	async getFolders(): Promise<EmailFolder[]> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.getBoxes((error, boxes) => {
				if (error) {
					reject(error);
					return;
				}

				const folders = this.parseBoxes(boxes);
				resolve(folders);
			});
		});
	}

	async getMessages(
		folder: string,
		limit = 50,
		sequenceRange?: string,
	): Promise<EmailMessage[]> {
		if (!this.imap) throw new Error('Not connected');

		const startTime = Date.now();
		debugLog(
			LogLevel.INFO,
			'ImapService',
			`getMessages START - folder: ${folder}, limit: ${limit}, range: ${
				sequenceRange ?? 'none'
			}`,
		);

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, error => {
				if (error) {
					reject(error);
					return;
				}

				debugLog(
					LogLevel.INFO,
					'ImapService',
					`openBox completed in ${Date.now() - startTime}ms`,
				);

				// For paginated requests, use sequence fetch directly
				if (sequenceRange?.includes(':')) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					const total: number = (this.imap as any)._box?.messages?.total ?? 0;

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
								const firstMessage = messages[0];
								const lastMessage = messages[messages.length - 1];
								if (firstMessage && lastMessage) {
									debugLog(
										LogLevel.INFO,
										'ImapService',
										`Messages date range: ${firstMessage.date.toISOString()} to ${lastMessage.date.toISOString()}`,
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

	async getMessage(
		folder: string,
		uid: number,
	): Promise<EmailMessage | undefined> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, error => {
				if (error) {
					reject(error);
					return;
				}

				let message: EmailMessage | undefined;

				const fetch = this.imap!.fetch(uid, {
					bodies: '', // Gets the full message including attachments
					struct: true, // Gets the MIME structure
					envelope: true,
					markSeen: false, // Don't mark as read when fetching
				});

				fetch.on('message', message_ => {
					const messageData: MessageData = {};

					message_.on('body', stream => {
						let buffer = '';
						stream.on('data', (chunk: Buffer) => {
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

					message_.on('attributes', (attrs: any) => {
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						messageData.uid = attrs.uid;
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						messageData.envelope = attrs.envelope;
						// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
						messageData.attributes = attrs;
						// Process message if we have all parts
						if (messageData.body) {
							processMessage();
						}
					});

					const processMessage = () => {
						simpleParser(
							messageData.body,
							(error_: any, parsed: ParsedMail) => {
								if (error_) {
									debugLog(
										LogLevel.ERROR,
										'ImapService',
										'Error parsing message:',
										error_,
									);
									return;
								}

								message = this.parsedMailToEmailMessage(
									parsed,
									messageData.uid ?? 0,
									messageData.envelope,
									messageData.attributes ?? {},
								);
							},
						);
					};
				});

				fetch.once('error', (error: Error) => {
					reject(error);
				});
				fetch.once('end', () => {
					resolve(message);
				});
			});
		});
	}

	async markAsRead(folder: string, uid: number): Promise<void> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, false, error => {
				if (error) {
					reject(error);
					return;
				}

				this.imap!.addFlags(uid, ['\\Seen'], (flagError: Error) => {
					if (flagError) reject(flagError);
					else resolve();
				});
			});
		});
	}

	async deleteMessage(folder: string, uid: number): Promise<void> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, false, error => {
				if (error) {
					reject(error);
					return;
				}

				this.imap!.addFlags(uid, ['\\Deleted'], (flagError: Error) => {
					if (flagError) {
						reject(flagError);
						return;
					}

					this.imap!.expunge((expungeError: Error) => {
						if (expungeError) reject(expungeError);
						else resolve();
					});
				});
			});
		});
	}

	async getFolderStatus(
		folder: string,
	): Promise<{total: number; unseen: number; maxSequence: number}> {
		if (!this.imap) throw new Error('Not connected');

		return new Promise((resolve, reject) => {
			this.imap!.openBox(folder, true, (error, box) => {
				if (error) {
					reject(error);
					return;
				}

				// Box.messages.total is the highest sequence number, even if there are gaps
				// This is exactly what we need for sequence-based fetching
				const maxSequence = box.messages.total ?? 0;

				// Search for ALL messages to get accurate count (handles deleted messages)
				this.imap!.search(['ALL'], (searchError, allResults) => {
					if (searchError) {
						// Fallback to box total if search fails
						const total = box.messages.total ?? 0;
						resolve({
							total,
							unseen: box.messages.new ?? 0,
							maxSequence,
						});
						return;
					}

					// Get actual count of existing messages
					const actualTotal = allResults ? allResults.length : 0;
					debugLog(
						LogLevel.INFO,
						'ImapService',
						`getFolderStatus: Found ${actualTotal} actual messages (box reports ${box.messages.total} max sequence)`,
					);

					// Search for unseen messages
					this.imap!.search(['UNSEEN'], (unseenError, unseenResults) => {
						if (unseenError) {
							resolve({
								total: actualTotal,
								unseen: box.messages.new ?? 0,
								maxSequence,
							});
							return;
						}

						const unseen = unseenResults ? unseenResults.length : 0;
						resolve({
							total: actualTotal,
							unseen,
							maxSequence,
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
			this.imap!.openBox(folder, true, async error => {
				if (error) {
					reject(error);
					return;
				}

				try {
					// For thread searching, we'll do multiple searches and combine results
					const allMessageIds = new Set<number>();

					// Helper function to search and add results
					const searchAndAdd = async (criteria: any[]): Promise<void> =>
						new Promise<void>(searchResolve => {
							this.imap!.search(criteria, (searchError, results) => {
								if (!searchError && results) {
									for (const id of results) allMessageIds.add(id);
								}

								searchResolve();
							});
						});

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
							// eslint-disable-next-line no-await-in-loop
							await searchAndAdd([['HEADER', 'MESSAGE-ID', cleanRef]]);
							// eslint-disable-next-line no-await-in-loop
							await searchAndAdd([['HEADER', 'REFERENCES', cleanRef]]);
						}
					}

					// Convert Set to array and sort
					const results = [...allMessageIds].sort((a, b) => a - b);

					if (results.length === 0) {
						resolve([]);
						return;
					}

					// Fetch all the messages
					const messages: EmailMessage[] = [];
					const fetch = this.imap!.seq.fetch(results, {
						bodies: '', // Gets the full message including attachments
						struct: true, // Gets the MIME structure
						envelope: true,
						markSeen: false, // Don't mark as read when fetching
					});

					fetch.on('message', threadMessage => {
						const messageData: MessageData = {};

						threadMessage.on('body', stream => {
							let buffer = '';
							stream.on('data', (chunk: Buffer) => {
								buffer += chunk.toString('utf8');
							});
							stream.once('end', () => {
								messageData.body = buffer;
								if (messageData.attributes) {
									processMessage();
								}
							});
						});

						threadMessage.on('attributes', (attrs: any) => {
							// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
							messageData.uid = attrs.uid;
							// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
							messageData.envelope = attrs.envelope;
							// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
							messageData.attributes = attrs;
							if (messageData.body) {
								processMessage();
							}
						});

						const processMessage = () => {
							simpleParser(
								messageData.body,
								(parseError: any, parsed: ParsedMail) => {
									if (parseError) {
										debugLog(
											LogLevel.ERROR,
											'ImapService',
											'Error parsing thread message:',
											parseError,
										);
										return;
									}

									const message = this.parsedMailToEmailMessage(
										parsed,
										messageData.uid ?? 0,
										messageData.envelope,
										messageData.attributes ?? {},
									);
									message.accountId = '';
									message.folder = folder;
									messages.push(message);
								},
							);
						};
					});

					fetch.once('end', () => {
						// Sort messages by date
						messages.sort((a, b) => a.date.getTime() - b.date.getTime());
						resolve(messages);
					});

					fetch.once('error', (fetchError: Error) => {
						debugLog(LogLevel.ERROR, 'ImapService', 'Fetch error:', fetchError);
						resolve([]);
					});
				} catch (error_: unknown) {
					debugLog(
						LogLevel.ERROR,
						'ImapService',
						'Thread fetch error:',
						error_,
					);
					resolve([]);
				}
			});
		});
	}

	private buildXoauth2String(email: string, accessToken: string): string {
		const authString = [
			`user=${email}`,
			`auth=Bearer ${accessToken}`,
			'',
			'',
		].join('\u0001');

		return Buffer.from(authString).toString('base64');
	}

	private parseBoxes(boxes: any, parentPath = ''): EmailFolder[] {
		const folders: EmailFolder[] = [];

		const boxEntries: Array<[string, any]> = Object.entries(boxes);
		for (const [name, box] of boxEntries) {
			const folder: EmailFolder = {
				name: parentPath
					? `${parentPath}${String(box.delimiter)}${name}`
					: name,
				displayName: name,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				delimiter: box.delimiter,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				name: addr.name,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				address: addr.address ?? '',
			}));
		}

		if (addresses.value) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
			return addresses.value.map((addr: any) => ({
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				name: addr.name,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				address: addr.address ?? '',
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
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const attrs = attributes ?? {};

		// Debug log for attachments
		if (parsed.attachments && parsed.attachments.length > 0) {
			debugLog(
				LogLevel.INFO,
				'ImapService',
				`Message UID ${uid} has ${parsed.attachments.length} attachments:`,
				parsed.attachments.map((att: any) => ({
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					filename: att.filename,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					contentType: att.contentType,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					size: att.size,
				})),
			);
		}

		return {
			id: parsed.messageId ?? `${uid}`,
			accountId: '', // Will be set by the caller
			folder: '', // Will be set by the caller
			uid,
			messageId: parsed.messageId ?? '',
			from: this.parseAddresses(parsed.from),
			to: this.parseAddresses(parsed.to),
			cc: this.parseAddresses(parsed.cc),
			bcc: this.parseAddresses(parsed.bcc),
			subject: parsed.subject ?? '',
			date: parsed.date ?? new Date(),
			body: {
				text: parsed.text ?? undefined,
				html: parsed.html || undefined,
			},
			attachments: parsed.attachments?.map((att: any) => ({
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				filename: att.filename ?? '',
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				contentType: att.contentType,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				size: att.size,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				contentId: att.contentId,
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				content: att.content,
			})),
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
			flags: attrs.flags ?? [],
			threadId: parsed.inReplyTo ?? undefined,
			inReplyTo: parsed.inReplyTo ?? undefined,
			references: parsed.references
				? Array.isArray(parsed.references)
					? parsed.references
					: [parsed.references]
				: undefined,
		};
	}

	private fetchBySequence(
		folder: string,
		sequenceRange: string | undefined,
		resolve: (messages: EmailMessage[]) => void,
		reject: (error: unknown) => void,
	): void {
		const startTime = Date.now();
		const messages: EmailMessage[] = [];
		// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
		const imapBox: any = (this.imap as any)._box;
		const rawTotal: unknown = imapBox?.messages?.total;
		const boxTotal = typeof rawTotal === 'number' ? rawTotal : 0;
		const fetchRange = sequenceRange ?? `${Math.max(1, boxTotal - 50 + 1)}:*`;

		debugLog(
			LogLevel.INFO,
			'ImapService',
			`fetchBySequence: Fetching range ${fetchRange} from folder ${folder}`,
		);

		const fetch = this.imap!.seq.fetch(fetchRange, {
			bodies: '', // Gets the full message including attachments
			struct: true, // Gets the MIME structure
			envelope: true,
			markSeen: false, // Don't mark as read when fetching
		});

		fetch.on('message', seqMessage => {
			const messageData: MessageData = {};

			seqMessage.on('body', stream => {
				let buffer = '';
				stream.on('data', (chunk: Buffer) => {
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

			seqMessage.on('attributes', (attrs: any) => {
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				messageData.uid = attrs.uid;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				messageData.envelope = attrs.envelope;
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				messageData.attributes = attrs;
				// Process message if we have all parts
				if (messageData.body) {
					processMessage();
				}
			});

			const processMessage = () => {
				simpleParser(messageData.body, (error: any, parsed: ParsedMail) => {
					if (error) {
						debugLog(
							LogLevel.ERROR,
							'ImapService',
							'Error parsing message:',
							error,
						);
						return;
					}

					const emailMessage = this.parsedMailToEmailMessage(
						parsed,
						messageData.uid ?? 0,
						messageData.envelope,
						messageData.attributes ?? {},
					);
					emailMessage.accountId = '';
					emailMessage.folder = '';
					messages.push(emailMessage);
				});
			};
		});

		fetch.once('error', (error: Error) => {
			debugLog(LogLevel.ERROR, 'ImapService', 'fetchBySequence error:', error);
			reject(error);
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
}
