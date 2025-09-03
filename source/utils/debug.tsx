import fs from 'node:fs';
import {useStderr} from 'ink';
import {useEffect, useRef} from 'react';
import React from 'react';
import {Text, Box} from 'ink';

// Debug configuration
export const DEBUG_CONFIG = {
	enabled:
		process.env['DEBUG'] === 'true' || process.env['DEBUG_EMAI'] === 'true',
	logFile: process.env['DEBUG_LOG_FILE'] || 'emai-debug.log',
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
	const dataStr = data ? ` | ${JSON.stringify(data)}` : '';
	const logEntry = `[${timestamp}] [${level}] [${component}] ${message}${dataStr}`;

	// Write to file (only if stream is still open)
	if (logStream && !isLogStreamClosed) {
		try {
			logStream.write(logEntry + '\n');
		} catch (err) {
			// Ignore write errors after stream is closed
		}
	}

	// Write to console (Ink will handle this properly)
	if (DEBUG_CONFIG.useStderr) {
		switch (level) {
			case LogLevel.ERROR:
				console.error(logEntry);
				break;
			case LogLevel.WARN:
				console.warn(logEntry);
				break;
			default:
				console.log(logEntry);
		}
	}
}

// Component-specific debug hook
export function useDebug(componentName: string) {
	const stderrRef = useRef<{write: (data: string) => void} | null>(null);

	// Only use stderr hook if debug is enabled
	if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.useStderr) {
		const stderr = useStderr();
		stderrRef.current = stderr;
	}

	useEffect(() => {
		if (DEBUG_CONFIG.enabled) {
			debugLog(LogLevel.DEBUG, componentName, 'Component mounted');

			return () => {
				debugLog(LogLevel.DEBUG, componentName, 'Component unmounted');
			};
		}
		return undefined;
	}, [componentName]);

	return {
		debug: (message: string, data?: any) =>
			debugLog(LogLevel.DEBUG, componentName, message, data),
		info: (message: string, data?: any) =>
			debugLog(LogLevel.INFO, componentName, message, data),
		warn: (message: string, data?: any) =>
			debugLog(LogLevel.WARN, componentName, message, data),
		error: (message: string, data?: any) =>
			debugLog(LogLevel.ERROR, componentName, message, data),
		writeStderr: (message: string) => {
			if (stderrRef.current) {
				stderrRef.current.write(`[${componentName}] ${message}\n`);
			}
		},
	};
}

// Cleanup function
export function closeDebugLog() {
	if (logStream && !isLogStreamClosed) {
		isLogStreamClosed = true;
		logStream.end();
		logStream = null;
	}
}

// Debug component for displaying debug status
export const DebugStatus: React.FC = () => {
	if (!DEBUG_CONFIG.enabled) return null;

	return (
		<Box borderStyle="single" borderColor="yellow" paddingX={1}>
			<Text color="yellow">
				DEBUG MODE | Log: {DEBUG_CONFIG.logFile} | Stderr:{' '}
				{String(DEBUG_CONFIG.useStderr)}
			</Text>
		</Box>
	);
};
