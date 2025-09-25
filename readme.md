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
git clone https://github.com/yourusername/chaski.git
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

## Configuration

### Email Account Setup

The app supports three types of email accounts:

#### Gmail (OAuth2)

```
Provider: Gmail
Authentication: OAuth2
Client ID: Your Google OAuth2 Client ID
Client Secret: Your Google OAuth2 Client Secret
```

#### Outlook (OAuth2)

```
Provider: Outlook
Authentication: OAuth2
Client ID: Your Microsoft OAuth2 Client ID
Client Secret: Your Microsoft OAuth2 Client Secret
```

#### Custom IMAP/SMTP

```
Provider: Custom
IMAP Host: imap.example.com
IMAP Port: 993
SMTP Host: smtp.example.com
SMTP Port: 587
Username: your@email.com
Password: Your password
```

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

While the app doesn't require environment variables for basic operation, you can set these for OAuth2 providers:

```bash
# Optional: Default OAuth2 credentials
GMAIL_CLIENT_ID=your_google_client_id
GMAIL_CLIENT_SECRET=your_google_client_secret
OUTLOOK_CLIENT_ID=your_microsoft_client_id
OUTLOOK_CLIENT_SECRET=your_microsoft_client_secret
```

To unlock the AI assistant, add your OpenAI key as well:

```bash
OPENAI_API_KEY=sk-live-your-key
```

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
| `/compose`                   | Compose a new email                 |
| `/refresh`                   | Refresh current folder              |
| `/refresh-all`               | Refresh all folders                 |
| `/refresh-inbox`             | Quick refresh inbox only            |
| `/auto-refresh`              | Toggle auto-refresh on/off          |
| `/auto-refresh-interval <n>` | Set refresh interval (1-60 minutes) |
| `/cache-status`              | Show cache statistics               |
| `/cache-clear`               | Clear all cached data               |
| `/settings`                  | Open settings dialog                |
| `/assistant-clear`          | Reset assistant conversation        |
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
3. For Gmail/Outlook, ensure "Less secure app access" or app passwords are configured
4. Check firewall settings

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
│   ├── types/            # TypeScript type definitions
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

For bugs and feature requests, please [open an issue](https://github.com/yourusername/chaski/issues).

---

**Note**: This is free and open-source software. Your contributions help make it better for everyone! 🚀
