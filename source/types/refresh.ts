export interface RefreshStatus {
	isRefreshing: boolean;
	message?: string;
	progress?: {
		current: number;
		total: number;
	};
	error?: string;
}

export type RefreshScope = 'current' | 'all' | 'inbox';
