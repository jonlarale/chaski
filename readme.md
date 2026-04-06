<div align="center">
  <img src="public/chaski.png" alt="Chaski Logo" width="400"/>
</div>

# Chaski

A secure, feature-rich terminal-based email client built with React (Ink) and TypeScript. Navigate your inbox, compose emails, and manage multiple accounts - all from the comfort of your terminal.

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)
![Node](https://img.shields.io/badge/Node-16+-green.svg)
[![Contributions Welcome](https://img.shields.io/badge/contributions-welcome-brightgreen.svg?style=flat)](CONTRIBUTING.md)

## Features

- 📧 **Multi-Account Support** - Manage Gmail, Outlook, and IMAP/SMTP accounts
- 🔒 **Secure Credential Storage** - Encrypted password storage with XOR encryption
- 🔄 **Auto-Refresh** - Configurable automatic email synchronization
- 💾 **Smart Caching** - SQLite-based message caching for offline access
- 🤖 **AI Inbox Assistant** - Ask contextual questions about your mail directly from the command bar (OpenAI key required)
- 🔌 **MCP Server** - Expose your email as tools for AI agents via the [Model Context Protocol](https://modelcontextprotocol.io)
- ⌨️ **Vim-style Navigation** - Intuitive keyboard shortcuts
- 🎨 **Beautiful TUI** - Clean, responsive terminal interface
- 📝 **Full Email Capabilities** - Read, compose, reply, and forward emails
- 🔐 **OAuth2 Support** - Secure authentication for Gmail and Outlook

## Installation

### Prerequisites

- Node.js 16 or higher
- npm or yarn
- Terminal with UTF-8 support

### Install from npm (when published)

```bash
npm install -g chaski
```

### Install from Source

```bash
# Clone the repository
git clone https://github.com/jonlarale/chaski.git
cd chaski

# Install dependencies
npm install

# Build the application
npm run build

# Link globally for system-wide access
npm link
```

## Quick Start

1. Launch the application:

```bash
chaski
# or if running from source:
npm start
```

2. Add your first email account:

   - Press `/` to open command palette
   - Type `/add-account` and press Enter
   - Follow the setup wizard

3. Navigate your inbox:
   - Use `j`/`k` or arrow keys to move between messages
   - Press `Enter` to read an email
   - Press `Tab` to switch between folders and messages
   - Press `c` to compose a new email
4. Ask the assistant:
   - Activate the bar with `Tab` and type your question without a leading `/` to get a summary.
   - Use `/assistant-clear` if you need to reset the thread.

## AI Assistant

Chaski includes a contextual assistant that answers questions about the email already synced to your machine. To enable it:

1. Create a `.env` file in the project root (or export the variables another way).
2. Set your OpenAI key as `OPENAI_API_KEY` (the aliases `OPENAI_KEY` and `OPENAI_TOKEN` also work).
3. Run the app with `npm start` or `chaski`; the process loads `.env` automatically.

Once configured, type any message without a leading `/` in the command bar to chat with the assistant. The bottom panel surfaces the recent history and request status. Use `/assistant-clear` whenever you need a fresh conversation. The default model is `gpt-4o-mini`, and only local mail summaries are sent—no unrelated data leaves your machine.

## MCP Server

Chaski ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets AI agents read, search, and send emails on your behalf. The server reuses the same service layer as the interactive TUI, so anything you can do in the terminal you can also do programmatically.

### Running the MCP Server

```bash
# Build first (required)
npm run build

# Run the compiled server (recommended)
npm run mcp:build
# or directly:
node dist/mcp/index.js

# Development mode (uses tsx, no build needed)
npm run mcp
```

The server communicates over **stdio** (JSON-RPC), which is the standard transport for local MCP integrations such as Claude Code and other AI-powered tools.

### Configuring with Claude Code

The easiest way is to create a `.mcp.json` file in the chaski project root:

```json
{
	"mcpServers": {
		"chaski": {
			"command": "node",
			"args": ["dist/mcp/index.js"],
			"cwd": "/absolute/path/to/chaski"
		}
	}
}
```

Alternatively, add it to your global Claude Code settings (`~/.claude/settings.json`):

```json
{
	"mcpServers": {
		"chaski": {
			"command": "node",
			"args": ["/absolute/path/to/chaski/dist/mcp/index.js"],
			"cwd": "/absolute/path/to/chaski"
		}
	}
}
```

> **Important — NVM users:** If you use NVM to manage Node.js, `node` may not be on the system PATH when Claude Code spawns subprocesses. Use the absolute path to your node binary instead:
>
> ```json
> "command": "/Users/you/.nvm/versions/node/v22.x.x/bin/node"
> ```
>
> Find your path with: `which node` or `echo "$(dirname $(realpath $(which node)))/node"`

After configuration, restart Claude Code and it will have access to all Chaski tools automatically.

### Available MCP Tools

| Tool                  | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `list-accounts`       | List configured email accounts (credentials are never exposed)       |
| `add-account`         | Add a new email account (tests IMAP/SMTP connection before saving)   |
| `remove-account`      | Remove an email account and its stored credentials                   |
| `list-folders`        | List all folders/mailboxes for an account                            |
| `get-folder-status`   | Get total and unread message counts for a folder                     |
| `list-messages`       | List messages from the local cache (fast, use after refresh)         |
| `read-message`        | Read a single email with its full body                               |
| `get-thread`          | Retrieve all messages in a conversation thread                       |
| `search-messages`     | Search cached messages by subject, sender, or preview content        |
| `send-email`          | Send an email (compose, reply, or forward)                           |
| `mark-as-read`        | Mark a message as read                                               |
| `delete-message`      | Delete a message                                                     |
| `refresh-folder`      | Sync messages from the IMAP server into the local cache              |
| `get-cache-status`    | Get statistics about the local SQLite cache                          |
| `ask-assistant`       | Ask the AI assistant a question about your emails (needs OpenAI)     |
| `download-attachment` | Download an email attachment to disk                                 |

### Available MCP Resources

| Resource URI                            | Description                         |
| --------------------------------------- | ----------------------------------- |
| `chaski://accounts`                     | All configured accounts (sanitized) |
| `chaski://accounts/{accountId}/folders` | Folder tree for a specific account  |
| `chaski://settings`                     | Current user settings               |

### Testing with MCP Inspector

You can interactively test all tools using the official MCP Inspector:

```bash
# Using the compiled build (recommended)
npx @modelcontextprotocol/inspector node dist/mcp/index.js

# Or in development mode
npx @modelcontextprotocol/inspector npx tsx source/mcp/index.ts
```

### Security Notes

- Credentials (passwords, OAuth tokens, client secrets) are **never** exposed through MCP responses. All account data is sanitized before being returned.
- The MCP server runs locally and communicates over stdio — no network ports are opened.
- Attachment binary content is not included in message responses; use `download-attachment` to save specific files to disk.

## Configuration

### Email Account Setup

Chaski supports three types of email accounts. For Gmail and Outlook the recommended method is **OAuth2** -- users sign in through their browser and never share their password with Chaski.

---

### Gmail / Google Workspace OAuth2 Setup

> This is the **recommended** way to connect any `@gmail.com` or Google Workspace account.

#### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project selector at the top and choose **New Project**
3. Give it a name (e.g. "Chaski Email") and click **Create**

#### 2. Enable the Gmail API

1. In your project, go to **APIs & Services > Library**
2. Search for **Gmail API** and click **Enable**

#### 3. Configure the OAuth consent screen

1. Go to **APIs & Services > OAuth consent screen**
2. Select **External** (or **Internal** if you have Google Workspace and only need it for your organization)
3. Fill in the required fields: App name, User support email, Developer contact email
4. On the **Scopes** step, add these scopes:
   - `https://mail.google.com/`
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.send`
   - `https://www.googleapis.com/auth/gmail.modify`
5. On the **Test users** step, add the Gmail/Workspace email addresses that will use Chaski
6. Click **Save and Continue**

#### 4. Create OAuth2 credentials

1. Go to **APIs & Services > Credentials**
2. Click **Create Credentials > OAuth client ID**
3. Application type: **Web application** (or Desktop app)
4. If you chose Web application, add an **Authorized redirect URI**:
   ```
   http://localhost:3000/oauth2/callback
   ```
   > Change the port/path if you customized `OAUTH_CALLBACK_PORT` or `OAUTH_CALLBACK_PATH`.
5. Click **Create**
6. Copy the **Client ID** and **Client Secret**

#### 5. Add credentials to `.env`

```bash
cp .env.example .env
```

Edit `.env` and fill in:

```bash
GMAIL_CLIENT_ID=123456789-abc.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
```

#### 6. Add your account in Chaski

1. Run `chaski` (or `npm start`)
2. Press Tab, type `/add-account`, press Enter
3. Select **Gmail / Google Workspace**
4. Select **OAuth2 (Recommended)**
5. Enter your email address
6. Your browser will open automatically -- sign in and authorize Chaski
7. The browser shows "Authorization Successful" and you can close it
8. Chaski saves the account and you're ready to go

---

### Outlook / Office 365 OAuth2 Setup

#### 1. Register an app in Azure AD

1. Go to [Azure Portal - App registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Click **New registration**
3. Name: "Chaski Email"
4. Supported account types: choose as appropriate for your organization
5. Redirect URI: **Web** > `http://localhost:3000/oauth2/callback`
   > Change the port/path if you customized `OAUTH_CALLBACK_PORT` or `OAUTH_CALLBACK_PATH`.
6. Click **Register**

#### 2. Create a client secret

1. Go to **Certificates & secrets > New client secret**
2. Copy the **Value** (this is your client secret)

#### 3. Note the Application (client) ID

Found on the app's **Overview** page.

#### 4. Configure API permissions

1. Go to **API permissions > Add a permission > Microsoft Graph**
2. Add: `IMAP.AccessAsUser.All`, `SMTP.Send`, `offline_access`
3. Click **Grant admin consent** if you are an admin

#### 5. Add credentials to `.env`

```bash
OUTLOOK_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
OUTLOOK_CLIENT_SECRET=your_secret_value
```

#### 6. Add your account in Chaski

Same flow as Gmail: `/add-account` > Outlook > OAuth2 > enter email > authorize in browser.

---

### Custom IMAP/SMTP

For any email provider that supports IMAP/SMTP (Fastmail, Zoho, self-hosted, etc.):

1. `/add-account` > **Other (IMAP/SMTP)**
2. Enter your email address
3. Enter IMAP server hostname (e.g. `imap.fastmail.com`)
4. Enter your password
5. Enter SMTP server hostname (e.g. `smtp.fastmail.com`)

Default ports: IMAP 993 (TLS), SMTP 587 (STARTTLS).

---

### Application Settings

Settings are stored in `~/.chaski/settings.json`:

```json
{
	"display": {
		"messagesPerPage": 20,
		"foldersExpanded": false
	},
	"autoRefresh": {
		"enabled": true,
		"intervalMinutes": 5
	}
}
```

### Environment Variables

Copy `.env.example` to `.env` and configure as needed:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `GMAIL_CLIENT_ID` | For Gmail OAuth2 | -- | Google OAuth2 Client ID |
| `GMAIL_CLIENT_SECRET` | For Gmail OAuth2 | -- | Google OAuth2 Client Secret |
| `OUTLOOK_CLIENT_ID` | For Outlook OAuth2 | -- | Microsoft OAuth2 Client ID |
| `OUTLOOK_CLIENT_SECRET` | For Outlook OAuth2 | -- | Microsoft OAuth2 Client Secret |
| `OAUTH_CALLBACK_PORT` | No | `3000` | Port for the local OAuth2 callback server |
| `OAUTH_CALLBACK_PATH` | No | `/oauth2/callback` | Path for the OAuth2 callback |
| `OAUTH_REDIRECT_URI` | No | auto-built | Full redirect URI override (takes precedence) |
| `OPENAI_API_KEY` | For AI assistant | -- | OpenAI API key |
| `DEBUG` | No | `false` | Enable debug logging to `./debug.log` |
| `CACHE_MAX_AGE` | No | `10` | Cache max age in minutes |

## Security

### Credential Storage

chaski takes security seriously:

1. **Encrypted Storage**: All passwords and tokens are encrypted using XOR encryption before being stored
2. **Local Storage Only**: Credentials are stored locally in `~/.chaski/.secrets` with restricted permissions (0600)
3. **No Plain Text**: Passwords are never stored in plain text
4. **Secure File Permissions**: Configuration files are created with user-only read/write permissions

### Security Best Practices

- The app uses a machine-specific encryption key derived from your home directory path
- OAuth2 tokens are refreshed automatically and securely stored
- All sensitive files are stored in your home directory with restricted permissions
- The SQLite cache database is also protected with user-only permissions

### Why It's Secure

1. **Isolation**: All data stays on your machine - nothing is sent to external servers
2. **Encryption**: Credentials are encrypted at rest
3. **Permissions**: Strict file permissions prevent other users from accessing your data
4. **Open Source**: The entire codebase is open for security audits
5. **No Telemetry**: Zero tracking or analytics

## Commands

Press `/` to open the command palette:

| Command                      | Description                         |
| ---------------------------- | ----------------------------------- |
| `/add-account`               | Add a new email account             |
| `/edit-account`              | Edit existing account settings      |
| `/remove-account`            | Remove an email account             |
| `/login`                     | Re-authenticate an OAuth2 account   |
| `/compose`                   | Compose a new email                 |
| `/refresh`                   | Refresh current folder              |
| `/refresh-all`               | Refresh all folders                 |
| `/refresh-inbox`             | Quick refresh inbox only            |
| `/auto-refresh`              | Toggle auto-refresh on/off          |
| `/auto-refresh-interval <n>` | Set refresh interval (1-60 minutes) |
| `/cache-status`              | Show cache statistics               |
| `/cache-clear`               | Clear all cached data               |
| `/settings`                  | Open settings dialog                |
| `/assistant-clear`           | Reset assistant conversation        |
| `/help`                      | Show all commands                   |
| `/quit`                      | Exit the application                |

## Keyboard Shortcuts

### Navigation

- `j`/`↓` - Move down
- `k`/`↑` - Move up
- `Tab` - Switch focus between panels
- `Enter`/`→` - Open selected item
- `Esc`/`←` - Go back

### Email Actions

- `c` - Compose new email
- `r` - Reply to email
- `f` - Forward email
- `d` - Delete email
- `Space` - Mark as read/unread

### Application

- `/` - Open command palette
- `?` - Show help
- `q` - Quit application

## Data Storage

All application data is stored in `~/.chaski/`:

```
~/.chaski/
├── accounts.json      # Account configurations (no passwords)
├── .secrets          # Encrypted credentials
├── settings.json     # User preferences
└── cache/
    └── messages.db   # SQLite message cache
```

## Troubleshooting

### Cannot connect to email server

1. Check your internet connection
2. Verify IMAP/SMTP settings
3. For Gmail/Outlook, use OAuth2 (recommended) or App Passwords -- regular passwords do not work
4. Ensure IMAP is enabled in your email provider settings
5. Check firewall settings -- the OAuth2 callback server uses port 3000 by default

### Cache issues

```bash
# Clear the cache
/cache-clear
# Or manually delete
rm -rf ~/.chaski/cache
```

### Reset application

```bash
# Remove all application data
rm -rf ~/.chaski
```

## Development

### Running from Source

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev  # TypeScript watch mode
npm start    # Run the app

# Run tests
npm test

# Build for production
npm run build
```

### Project Structure

```
chaski/
├── source/
│   ├── app.tsx           # Main application component
│   ├── cli.tsx           # CLI entry point
│   ├── components/       # UI components
│   ├── services/         # Email, storage, cache services
│   ├── mcp/              # MCP server (tools, resources, schemas)
│   ├── types/            # TypeScript type definitions
│   ├── utils/            # Utility functions
│   └── constants/        # UI constants and themes
├── dist/                 # Compiled JavaScript
└── test/                 # Test files
```

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on:

- Code of Conduct
- Development setup
- Pull request process
- Coding standards

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### v0.4.0

- **`/login` command** — Re-authenticate OAuth2 accounts when tokens expire without removing and re-adding the account
- **Automatic token refresh retry** — IMAP and SMTP connections now retry once with a fresh token when authentication fails, instead of failing immediately
- **Microsoft OAuth2 refresh token fix** — Refresh tokens are now properly extracted and stored for Outlook/Office 365 accounts, enabling automatic token renewal
- **Accurate token expiry** — Token expiry is now taken from the OAuth2 provider response instead of using a hardcoded 1-hour value

### v0.3.2

- Configurable OpenAI model for the AI assistant

### v0.3.1

- OAuth2 flow, connection validation, and MCP account management

### v0.3.0

- MCP server, account management, and codebase quality improvements

## Sponsoring

If you find this project useful, consider supporting its development:

<a href="https://www.buymeacoffee.com/jonlarale">
  <img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me A Coffee">
</a>

## Author

**Jonathan Larraguivel Alemán**
Email: jonlarale@gmail.com
GitHub: [@jonlarale](https://github.com/jonlarale)

## Acknowledgments

- Built with [Ink](https://github.com/vadimdemedes/ink) - React for interactive command-line apps
- Email protocols powered by [node-imap](https://github.com/mscdex/node-imap) and [nodemailer](https://nodemailer.com/)
- Terminal UI enhanced with [ink-gradient](https://github.com/sindresorhus/ink-gradient) and [ink-big-text](https://github.com/sindresorhus/ink-big-text)

## Support

For bugs and feature requests, please [open an issue](https://github.com/jonlarale/chaski/issues).

---

**Note**: This is free and open-source software. Your contributions help make it better for everyone! 🚀
