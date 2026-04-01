import fs from 'node:fs';
import process from 'node:process';

// Debug configuration
// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEBUG_CONFIG = {
	enabled:
		process.env['DEBUG'] === 'true' || process.env['DEBUG_EMAI'] === 'true',
	logFile: process.env['DEBUG_LOG_FILE'] ?? 'emai-debug.log',
	useStderr: process.env['DEBUG_STDERR'] !== 'false',
	useFile: process.env['DEBUG_FILE'] !== 'false',
};

// Create log stream
let logStream =
	DEBUG_CONFIG.enabled && DEBUG_CONFIG.useFile
		? fs.createWriteStream(DEBUG_CONFIG.logFile, {flags: 'a'})
		: null;

// Track if the log stream has been closed
let isLogStreamClosed = false;

// Log levels
export enum LogLevel {
	DEBUG = 'DEBUG',
	INFO = 'INFO',
	WARN = 'WARN',
	ERROR = 'ERROR',
}

// Base logging function
export function debugLog(
	level: LogLevel,
	component: string,
	message: string,
	data?: any,
) {
	if (!DEBUG_CONFIG.enabled) return;

	const timestamp = new Date().toISOString();
	const dataString = data ? ` | ${JSON.stringify(data)}` : '';
	const logEntry = `[${timestamp}] [${level}] [${component}] ${message}${dataString}`;

	// Write to file (only if stream is still open)
	if (logStream && !isLogStreamClosed) {
		try {
			logStream.write(logEntry + '\n');
		} catch {
			// Ignore write errors after stream is closed
		}
	}

	// Write to console
	if (DEBUG_CONFIG.useStderr) {
		switch (level) {
			case LogLevel.ERROR: {
				console.error(logEntry);
				break;
			}

			case LogLevel.WARN: {
				console.warn(logEntry);
				break;
			}

			default: {
				console.log(logEntry);
			}
		}
	}
}

// Cleanup function
export function closeDebugLog() {
	if (logStream && !isLogStreamClosed) {
		isLogStreamClosed = true;
		logStream.end();
		logStream = null;
	}
}
