export type UserSettings = {
	display: {
		messagesPerPage: number;
		foldersExpanded: boolean;
	};
	shortcuts?: {
		nextPage?: string;
		prevPage?: string;
	};
	autoRefresh?: {
		enabled: boolean;
		intervalMinutes: number; // Interval in minutes between automatic refreshes
	};
};

// eslint-disable-next-line @typescript-eslint/naming-convention
export const DEFAULT_SETTINGS: UserSettings = {
	display: {
		messagesPerPage: 20,
		foldersExpanded: false,
	},
	shortcuts: {
		nextPage: 'Shift+N',
		prevPage: 'Shift+P',
	},
	autoRefresh: {
		enabled: true,
		intervalMinutes: 5, // Check for new messages every 5 minutes by default
	},
};
