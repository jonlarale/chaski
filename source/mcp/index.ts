#!/usr/bin/env node
import 'dotenv/config.js'; // eslint-disable-line import/no-unassigned-import
import process from 'node:process';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {EmailService} from '../services/emailService.js';
import {CacheService} from '../services/cacheService.js';
import {AssistantService} from '../services/assistantService.js';
import {SettingsService} from '../services/settingsService.js';
import {DownloadService} from '../services/downloadService.js';
import {registerTools, type ServiceContainer} from './tools.js';
import {registerResources} from './resources.js';

const emailService = new EmailService();
const cacheService = new CacheService();
const assistantService = new AssistantService();
const settingsService = new SettingsService();
const downloadService = new DownloadService();

const services: ServiceContainer = {
	emailService,
	cacheService,
	assistantService,
	settingsService,
	downloadService,
};

const server = new McpServer({
	name: 'chaski-email',
	version: '0.2.1',
});

registerTools(server, services);
registerResources(server, services);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error('Chaski MCP server running on stdio');

// Graceful shutdown
const cleanup = async () => {
	console.error('Shutting down Chaski MCP server...');
	await emailService.disconnectAll();
	cacheService.close();
	await server.close();
	process.exit(0);
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
