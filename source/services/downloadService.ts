import type {Buffer} from 'node:buffer';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export type AttachmentData = {
	filename: string;
	contentType: string;
	size: number;
	content?: Buffer;
};

export type DownloadResult = {
	success: boolean;
	filePath?: string;
	error?: string;
};

export class DownloadService {
	/**
	 * Format file size for display
	 */
	static formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';

		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		const size = sizes[i] ?? 'B';

		return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${size}`;
	}

	private downloadPath: string;

	constructor(customPath?: string) {
		// Default to ~/Downloads/chaski/ or custom path
		this.downloadPath =
			customPath ?? path.join(os.homedir(), 'Downloads', 'chaski');
	}

	/**
	 * Set a custom download path
	 */
	async setDownloadPath(newPath: string): Promise<void> {
		this.downloadPath = newPath;
		await this.ensureDownloadDirectory();
	}

	/**
	 * Get the current download path
	 */
	getDownloadPath(): string {
		return this.downloadPath;
	}

	/**
	 * Download a single attachment
	 */
	async downloadAttachment(
		attachment: AttachmentData,
	): Promise<DownloadResult> {
		try {
			// Check if we have content to save
			if (!attachment.content) {
				return {
					success: false,
					error: 'No content available for this attachment',
				};
			}

			// Ensure download directory exists
			await this.ensureDownloadDirectory();

			// Sanitize filename
			const sanitizedFilename = attachment.filename.replace(/[^\w.-]/g, '_');

			// Get unique filepath
			const filePath = await this.getUniqueFilepath(sanitizedFilename);

			// Write the file
			await fs.writeFile(filePath, attachment.content);

			return {
				success: true,
				filePath,
			};
		} catch (error: unknown) {
			return {
				success: false,
				error:
					error instanceof Error ? error.message : 'Unknown error occurred',
			};
		}
	}

	/**
	 * Download multiple attachments
	 */
	async downloadMultipleAttachments(
		attachments: AttachmentData[],
	): Promise<DownloadResult[]> {
		const results: DownloadResult[] = [];

		for (const attachment of attachments) {
			// eslint-disable-next-line no-await-in-loop
			const result = await this.downloadAttachment(attachment);
			results.push(result);
		}

		return results;
	}

	/**
	 * Ensure the download directory exists
	 */
	private async ensureDownloadDirectory(): Promise<void> {
		try {
			await fs.access(this.downloadPath);
		} catch {
			// Directory doesn't exist, create it
			await fs.mkdir(this.downloadPath, {recursive: true});
		}
	}

	/**
	 * Generate a unique filename if file already exists
	 */
	private async getUniqueFilepath(filename: string): Promise<string> {
		const baseName = path.basename(filename, path.extname(filename));
		const extension = path.extname(filename);
		let filePath = path.join(this.downloadPath, filename);
		let counter = 1;

		// eslint-disable-next-line no-constant-condition
		while (true) {
			try {
				// eslint-disable-next-line no-await-in-loop
				await fs.access(filePath);
				// File exists, try with a counter
				filePath = path.join(
					this.downloadPath,
					`${baseName} (${counter})${extension}`,
				);
				counter++;
			} catch {
				// File doesn't exist, we can use this path
				return filePath;
			}
		}
	}
}
