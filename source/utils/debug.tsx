import React, {useEffect, useRef} from 'react';
import {Box, Text, useStderr} from 'ink';
import {DEBUG_CONFIG, LogLevel, debugLog} from './debug-core.js';

// Re-export everything from debug-core (no React/Ink dependencies)
export {DEBUG_CONFIG, LogLevel, debugLog, closeDebugLog} from './debug-core.js';

// Component-specific debug hook
export function useDebug(componentName: string) {
	const stderrRef = useRef<{write: (data: string) => void} | undefined>(
		undefined,
	);

	// Always call useStderr unconditionally (Rules of Hooks)
	const stderr = useStderr();

	// Only use stderr if debug is enabled
	if (DEBUG_CONFIG.enabled && DEBUG_CONFIG.useStderr) {
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
		debug(message: string, data?: unknown) {
			debugLog(LogLevel.DEBUG, componentName, message, data);
		},
		info(message: string, data?: unknown) {
			debugLog(LogLevel.INFO, componentName, message, data);
		},
		warn(message: string, data?: unknown) {
			debugLog(LogLevel.WARN, componentName, message, data);
		},
		error(message: string, data?: unknown) {
			debugLog(LogLevel.ERROR, componentName, message, data);
		},
		writeStderr(message: string) {
			if (stderrRef.current) {
				stderrRef.current.write(`[${componentName}] ${message}\n`);
			}
		},
	};
}

// Debug component for displaying debug status
export function DebugStatus() {
	if (!DEBUG_CONFIG.enabled) return null;

	return (
		<Box borderStyle="single" borderColor="yellow" paddingX={1}>
			<Text color="yellow">
				DEBUG MODE | Log: {DEBUG_CONFIG.logFile} | Stderr:{' '}
				{String(DEBUG_CONFIG.useStderr)}
			</Text>
		</Box>
	);
}
