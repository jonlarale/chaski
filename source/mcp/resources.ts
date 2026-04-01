import {
	type McpServer,
	ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js';
import {type ServiceContainer} from './tools.js';
import {sanitizeAccount} from './sanitize.js';

export function registerResources(
	server: McpServer,
	services: ServiceContainer,
) {
	const {emailService, settingsService} = services;

	// Static resource: all accounts
	server.resource(
		'accounts',
		'chaski://accounts',
		{
			description: 'List of all configured email accounts',
			mimeType: 'application/json',
		},
		async uri => {
			const accounts = await emailService.getAccounts();
			return {
				contents: [
					{
						uri: uri.href,
						text: JSON.stringify(
							accounts.map(a => sanitizeAccount(a)),
							null,
							2,
						),
						mimeType: 'application/json',
					},
				],
			};
		},
	);

	// Dynamic resource: folders per account
	server.resource(
		'account-folders',
		new ResourceTemplate('chaski://accounts/{accountId}/folders', {
			async list() {
				const accounts = await emailService.getAccounts();
				return {
					resources: accounts.map(a => ({
						uri: `chaski://accounts/${a.id}/folders`,
						name: `Folders for ${a.email}`,
					})),
				};
			},
		}),
		{
			description: 'Folder tree for a specific email account',
			mimeType: 'application/json',
		},
		async (uri, {accountId}) => {
			const folders = await emailService.getFolders(accountId as string);
			return {
				contents: [
					{
						uri: uri.href,
						text: JSON.stringify(folders, null, 2),
						mimeType: 'application/json',
					},
				],
			};
		},
	);

	// Static resource: settings
	server.resource(
		'settings',
		'chaski://settings',
		{description: 'Current user settings', mimeType: 'application/json'},
		async uri => {
			const settings = settingsService.getSettings();
			return {
				contents: [
					{
						uri: uri.href,
						text: JSON.stringify(settings, null, 2),
						mimeType: 'application/json',
					},
				],
			};
		},
	);
}
