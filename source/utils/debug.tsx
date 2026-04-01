import {useStderr} from 'ink';
import {useEffect, useRef} from 'react';
import React from 'react';
import {Text, Box} from 'ink';

// Re-export everything from debug-core (no React/Ink dependencies)
export {DEBUG_CONFIG, LogLevel, debugLog, closeDebugLog} from './debug-core.js';
import {DEBUG_CONFIG, LogLevel, debugLog} from './debug-core.js';

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
