// Color constants matching the HTML template design
export const colors = {
	// Primary colors
	blue: '#3b82f6',
	green: '#10b981',
	cyan: '#06b6d4',
	red: '#ef4444',
	magenta: '#ec4899',
	yellow: '#ffe66d',
	orange: '#fbbf24',

	// Neutral colors
	white: '#ffffff',
	black: '#000000',
	gray: '#888888',
	darkGray: '#666666',
	lightGray: '#333333',

	// Background colors
	bgPrimary: '#0c0c0c',
	bgSecondary: '#1a1a1a',
	bgHover: 'rgba(59, 130, 246, 0.1)',
	bgSelected: '#3b82f6',

	// Text colors
	textPrimary: '#ffffff',
	textSecondary: '#888888',
	textMuted: '#666666',
	textPlaceholder: '#666666',

	// Status colors
	unread: '#06b6d4',
	warning: '#fbbf24',
	error: '#ef4444',
	success: '#10b981',

	// Border colors
	borderPrimary: '#333333',
	borderActive: '#3b82f6',
	borderInactive: '#333333',
} as const;

// Semantic color mappings
export const semanticColors = {
	folder: {
		header: colors.blue,
		selected: colors.bgSelected,
		text: colors.white,
		icon: colors.white,
	},
	message: {
		unreadBullet: colors.cyan,
		unreadBulletSelected: colors.white,
		from: colors.textSecondary,
		fromUnread: colors.white,
		subject: colors.white,
		preview: colors.textSecondary,
		date: colors.textSecondary,
		threadIndicator: colors.cyan,
	},
	email: {
		header: colors.blue,
		from: colors.green,
		date: colors.yellow,
		subject: colors.white,
		content: colors.white,
		scrollIndicator: colors.blue,
		progressIndicator: colors.cyan,
	},
	composer: {
		header: colors.blue,
		label: colors.white,
		labelFocused: colors.blue,
		selectedAccount: colors.green,
		validation: {
			warning: colors.warning,
			error: colors.error,
		},
	},
	command: {
		prompt: colors.blue,
		text: colors.white,
		placeholder: colors.textPlaceholder,
		borderActive: colors.borderActive,
		borderInactive: colors.borderInactive,
		selected: colors.bgSelected,
	},
} as const;
