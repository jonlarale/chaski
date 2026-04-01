import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import type {UserSettings} from '../types/settings.js';
import {DEFAULT_SETTINGS} from '../types/settings.js';

const configDir = join(homedir(), '.chaski');
const settingsFile = join(configDir, 'settings.json');

export class SettingsService {
	private settings: UserSettings;

	constructor() {
		// Ensure config directory exists
		if (!existsSync(configDir)) {
			mkdirSync(configDir, {recursive: true});
		}

		// Load settings or use defaults
		this.settings = this.loadSettings();
	}

	getSettings(): UserSettings {
		return this.settings;
	}

	updateSettings(updates: Partial<UserSettings>): void {
		// Deep merge updates into current settings
		if (updates.display) {
			this.settings.display = {
				...this.settings.display,
				...updates.display,
			};
		}

		if (updates.shortcuts) {
			this.settings.shortcuts = {
				...this.settings.shortcuts,
				...updates.shortcuts,
			};
		}

		if (updates.autoRefresh) {
			this.settings.autoRefresh = {
				...this.settings.autoRefresh,
				...updates.autoRefresh,
			};
		}

		this.saveSettings(this.settings);
	}

	getMessagesPerPage(): number {
		return this.settings.display.messagesPerPage;
	}

	setMessagesPerPage(value: number): void {
		if (value < 1 || value > 100) {
			throw new Error('Messages per page must be between 1 and 100');
		}

		this.settings.display.messagesPerPage = value;
		this.saveSettings(this.settings);
	}

	getFoldersExpanded(): boolean {
		return this.settings.display.foldersExpanded;
	}

	setFoldersExpanded(value: boolean): void {
		this.settings.display.foldersExpanded = value;
		this.saveSettings(this.settings);
	}

	resetToDefaults(): void {
		this.settings = DEFAULT_SETTINGS;
		this.saveSettings(this.settings);
	}

	getAutoRefreshEnabled(): boolean {
		return (
			this.settings.autoRefresh?.enabled ??
			DEFAULT_SETTINGS.autoRefresh?.enabled ??
			true
		);
	}

	setAutoRefreshEnabled(value: boolean): void {
		if (!this.settings.autoRefresh) {
			this.settings.autoRefresh = {...DEFAULT_SETTINGS.autoRefresh!};
		}

		this.settings.autoRefresh.enabled = value;
		this.saveSettings(this.settings);
	}

	getAutoRefreshInterval(): number {
		return (
			this.settings.autoRefresh?.intervalMinutes ??
			DEFAULT_SETTINGS.autoRefresh?.intervalMinutes ??
			5
		);
	}

	setAutoRefreshInterval(minutes: number): void {
		if (minutes < 1 || minutes > 60) {
			throw new Error('Auto-refresh interval must be between 1 and 60 minutes');
		}

		if (!this.settings.autoRefresh) {
			this.settings.autoRefresh = {...DEFAULT_SETTINGS.autoRefresh!};
		}

		this.settings.autoRefresh.intervalMinutes = minutes;
		this.saveSettings(this.settings);
	}

	private loadSettings(): UserSettings {
		if (!existsSync(settingsFile)) {
			// Create default settings file
			this.saveSettings(DEFAULT_SETTINGS);
			return DEFAULT_SETTINGS;
		}

		try {
			const data = readFileSync(settingsFile, 'utf8');
			const loaded = JSON.parse(data) as UserSettings;

			// Merge with defaults to ensure all fields exist
			return this.mergeWithDefaults(loaded);
		} catch (error: unknown) {
			console.error('Failed to load settings, using defaults:', error);
			return DEFAULT_SETTINGS;
		}
	}

	private mergeWithDefaults(loaded: Partial<UserSettings>): UserSettings {
		return {
			display: {
				messagesPerPage:
					loaded.display?.messagesPerPage ??
					DEFAULT_SETTINGS.display.messagesPerPage,
				foldersExpanded:
					loaded.display?.foldersExpanded ??
					DEFAULT_SETTINGS.display.foldersExpanded,
			},
			shortcuts: {
				nextPage:
					loaded.shortcuts?.nextPage ?? DEFAULT_SETTINGS.shortcuts?.nextPage,
				prevPage:
					loaded.shortcuts?.prevPage ?? DEFAULT_SETTINGS.shortcuts?.prevPage,
			},
			autoRefresh: {
				enabled:
					loaded.autoRefresh?.enabled ??
					DEFAULT_SETTINGS.autoRefresh?.enabled ??
					true,
				intervalMinutes:
					loaded.autoRefresh?.intervalMinutes ??
					DEFAULT_SETTINGS.autoRefresh?.intervalMinutes ??
					5,
			},
		};
	}

	private saveSettings(settings: UserSettings): void {
		try {
			writeFileSync(settingsFile, JSON.stringify(settings, null, 2), {
				mode: 0o600,
			});
		} catch (error: unknown) {
			console.error('Failed to save settings:', error);
		}
	}
}
