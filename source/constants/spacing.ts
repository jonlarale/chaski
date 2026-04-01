// Spacing constants matching the HTML template design
// Base unit is 16px, but in terminal we use character units

export const spacing = {
	// Base units
	base: 1, // 1 character unit

	// Padding
	paddingXs: 0.5,
	paddingSm: 1,
	paddingMd: 1.5,
	paddingLg: 2,
	paddingXl: 2.5,

	// Margins
	marginXs: 0.5,
	marginSm: 1,
	marginMd: 1.5,
	marginLg: 2,
	marginXl: 2.5,

	// Component-specific spacing
	message: {
		paddingLeft: 2.5, // 20px equivalent - space for bullet + padding
		marginBottom: 1.5, // 15px equivalent
		bulletOffset: 1, // Position of unread bullet from left
	},

	folder: {
		padding: 1,
		accountIndent: 2.5, // Indent for account items under folders
		minWidth: 25, // 200px equivalent in characters
		widthPercent: 0.3, // 30% of terminal width
	},

	commandInput: {
		padding: 1,
		margin: 1,
		dropdownPadding: 1,
	},

	emailViewer: {
		headerPadding: 1.5,
		contentPadding: 1.5,
		scrollIndicatorPadding: 0.5,
	},

	composer: {
		headerPadding: 1.5,
		formPadding: 1.5,
		fieldMarginBottom: 1.5,
		labelWidth: 10, // Fixed width for form labels
	},

	app: {
		wrapperPadding: 2, // 16px equivalent
		bottomMargin: 2, // Space before command interface
	},
} as const;

// Layout breakpoints (in terminal columns)
export const breakpoints = {
	small: 80,
	medium: 120,
	large: 160,
} as const;

// Z-index values for layering
export const zIndex = {
	base: 0,
	dropdown: 10,
	modal: 20,
	overlay: 30,
} as const;
