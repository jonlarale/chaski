# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**chaski** is an open-source terminal-based email client built with Ink (React for CLIs) and TypeScript. It supports Gmail, Outlook, and custom IMAP/SMTP accounts with OAuth2 authentication, SQLite caching, and an optional OpenAI-powered inbox assistant.

**Open source principles:** This project is designed for anyone to clone and run on their own machine. Nothing should be hardcoded -- all provider credentials, callback URLs, ports, and API keys must be configurable via environment variables (`.env`). When adding features, always use `process.env['VAR_NAME']` with sensible defaults.

## Essential Commands

```bash
# Development
npm start         # Run the application with tsx
npm run dev       # TypeScript compiler in watch mode
npm run build     # Compile TypeScript to dist/

# Code Quality (run before committing)
npm test          # Runs prettier, xo linter, and ava tests in sequence

# Individual tools
npx prettier --check .    # Check formatting
npx xo                    # Run linter
npx ava                   # Run tests
npx ava test.tsx -m "*pattern*"  # Run specific test
```

## Architecture

### High-Level Structure

```
source/
├── app.tsx              # Main app component with routing and state
├── start.tsx            # Entry point (loads .env, renders App)
├── cli.tsx              # CLI interface (not currently used)
├── components/          # UI components (Ink/React)
├── services/            # Business logic layer
├── types/               # TypeScript type definitions
├── constants/           # UI constants and theme values
└── utils/               # Utility functions
```

### View Modes & Navigation

The app uses a state-based navigation system managed in [app.tsx](source/app.tsx):

**View Modes:**

- `main` - Split view with FolderList (left) and MessageList (right)
- `email` - Full-screen EmailViewer for reading a single message
- `thread` - ThreadViewer for conversation threads
- `compose` - EmailComposer for writing/replying/forwarding
- `addAccount` - AddAccountDialog for OAuth2/IMAP setup
- `editAccount` - EditAccountView for account management
- `settings` - SettingsDialog for app preferences

**Focus Management:**

- Only the focused component handles keyboard input (check `isFocused` prop)
- Tab key always activates CommandInput (command palette)
- In main view, focus toggles between `folders` and `messages` with arrow keys
- Components must respect `commandInputActive` state to prevent input conflicts

### Service Layer Architecture

All email operations go through the service layer, not directly from components:

**EmailService** ([emailService.ts](source/services/emailService.ts)):

- Facade for all email operations
- Manages ImapService and SmtpService instances per account
- Coordinates with OAuth2Service for token refresh
- Methods: `getAccounts()`, `getMessages()`, `sendEmail()`, `markAsRead()`, etc.

**AccountStorageService** ([accountStorageService.ts](source/services/accountStorageService.ts)):

- Persists accounts to `~/.chaski/accounts.json`
- Stores credentials in `~/.chaski/.secrets` with XOR encryption
- Note: Keytar support is disabled; file-based encryption is used
- Encryption key derived from `homedir() + SERVICE_NAME`

**CacheService** ([cacheService.ts](source/services/cacheService.ts)):

- SQLite database at `~/.chaski/cache/messages.db`
- Caches messages, folder metadata, and sync state
- Smart refresh: fetches only new messages after initial load
- Methods: `getCachedMessages()`, `updateMessages()`, `updateFolderMetadata()`

**ImapService** ([imapService.ts](source/services/imapService.ts)):

- Wraps `node-imap` library
- Handles folder operations, message fetching, flag updates
- Supports OAuth2 via xoauth2 token generation
- Connection pooling via EmailService's Map of instances

**SmtpService** ([smtpService.ts](source/services/smtpService.ts)):

- Wraps `nodemailer` library
- Sends emails with OAuth2 or password authentication
- Supports attachments and HTML/text multipart messages

**OAuth2Service** ([oauth2Service.ts](source/services/oauth2Service.ts)):

- Manages Google and Microsoft OAuth2 flows
- Token refresh for expired access tokens
- Uses `google-auth-library` and `@azure/msal-node`

**AssistantService** ([assistantService.ts](source/services/assistantService.ts)):

- OpenAI integration for inbox Q&A (requires `OPENAI_API_KEY` in .env)
- Builds context from cached messages
- Maintains conversation history
- Default model: `gpt-4o-mini`

**SettingsService** ([settingsService.ts](source/services/settingsService.ts)):

- Persists settings to `~/.chaski/settings.json`
- Auto-refresh intervals, messages per page, folder expansion state

**DownloadService** ([downloadService.ts](source/services/downloadService.ts)):

- Downloads email attachments to configurable directory
- Default: `~/Downloads/chaski/`

### Data Flow Example: Loading Messages

1. User selects folder/account in FolderList
2. App.tsx updates `selectedFolder` and `selectedAccount` state
3. MessageList component receives new props, triggers `useEffect`
4. MessageList calls `cacheService.getCachedMessages()` first (instant)
5. If cache exists, displays with age indicator: `[Cached 5m ago]`
6. User can run `/refresh` command to fetch from IMAP
7. App.tsx handles `/refresh` → calls `emailService.getMessages()`
8. EmailService → ImapService connects to IMAP, fetches messages
9. Messages stored in cache via `cacheService.updateMessages()`
10. `refreshTrigger` state increments, MessageList re-renders

### Authentication Flow

**OAuth2 (Gmail/Outlook):**

1. User selects provider in AddAccountDialog
2. App generates auth URL via EmailService/OAuth2Service
3. User authorizes in browser, pastes callback code
4. OAuth2Service exchanges code for tokens
5. Tokens stored in AccountStorageService (encrypted)
6. On IMAP/SMTP connect, tokens passed to services
7. If token expired, OAuth2Service auto-refreshes using refresh token

**Password (Custom IMAP/SMTP):**

1. User enters credentials in AddAccountDialog
2. Credentials encrypted and stored via AccountStorageService
3. On connect, credentials retrieved and decrypted

### Command System

Commands are handled in [app.tsx](source/app.tsx) `handleCommand()` function:

- Commands starting with `/` are system commands (e.g., `/refresh`, `/compose`)
- Non-slash input is treated as assistant query
- CommandInput component renders at bottom, activated by Tab
- Commands can be async (e.g., `/refresh` fetches from IMAP)

**Common Commands:**

- `/compose` - Open composer
- `/add-account` - Add email account
- `/edit-account` - Edit account settings
- `/refresh` - Refresh current folder
- `/refresh-inbox` - Quick inbox refresh
- `/cache-status` - Show cache stats
- `/auto-refresh` - Toggle auto-refresh
- `/download <n>` - Download attachment (in email view)
- `/assistant-clear` - Reset AI conversation
- `/quit` - Exit app

### AI Assistant Integration

The assistant ([AssistantPanel.tsx](source/components/AssistantPanel.tsx), [assistantService.ts](source/services/assistantService.ts)):

1. User types non-slash message in CommandInput
2. App.tsx calls `handleAssistantQuery()`
3. Context gathered from currently viewed/cached emails
4. AssistantService sends prompt + context + history to OpenAI
5. Response displayed in AssistantPanel (bottom of screen)
6. Conversation history maintained in App.tsx state

**Context Snapshot:**

- Includes up to 20 recent emails from current folder
- Pins currently opened email at top of context
- Metadata includes account, folder, subject, sender, date
- No full body sent by default (only preview/subject)

## Development Guidelines

### Code Style

- **Indentation:** Tabs (configured in Prettier)
- **Quotes:** Single quotes
- **Semicolons:** No semicolons except where required
- **Components:** React functional components with TypeScript
- **File extensions:** `.tsx` for React components, `.ts` for services/types

### Type Definitions

Key types in [types/email.ts](source/types/email.ts):

- `EmailAccount` - Account configuration (provider, auth, IMAP/SMTP)
- `EmailMessage` - Full message with body, attachments, flags, UID
- `EmailAddress` - Name and address pair
- `Attachment` - Filename, contentType, size, content buffer
- `OAuth2Config` - Provider, client credentials, tokens, expiry

### Adding Features

**Add a new keyboard shortcut:**

1. Update `useInput` hook in relevant component
2. Check `isFocused` prop before handling key
3. Update CommandBar to show new shortcut

**Add a new service:**

1. Create service class in `source/services/`
2. Instantiate in App.tsx with `useState(() => new Service())`
3. Pass to components via props or call from event handlers

**Add a new slash command:**

1. Add case in `app.tsx` `handleCommand()` switch statement
2. Implement handler function (can be async)
3. Update `/help` command output

**Modify message fetching:**

- Edit ImapService for IMAP protocol changes
- Edit CacheService for caching logic
- Edit EmailService to coordinate between them
- MessageList handles UI rendering

### Testing

- Component tests use `ink-testing-library`
- Test files: `*.test.tsx` or `test.tsx`
- Run specific test: `npx ava test.tsx -m "*pattern*"`
- AVA configured with ts-node/esm loader in package.json

## Important Implementation Notes

### Focus Management Rules

1. Only focused component processes keyboard input
2. Always check `isFocused` prop in `useInput` hooks
3. Tab key activates CommandInput from ANY view
4. When `commandInputActive` is true, components must ignore input
5. ESC behavior varies by view (see [app.tsx:284-310](source/app.tsx#L284-L310))

### Entry Point

- `start.tsx` is the entry point (NOT cli.tsx)
- start.tsx loads `.env` with dotenv
- Renders App component wrapped in Ink's `render()`
- cli.tsx exists but is not currently used

### Credential Security

- **NOT production-grade**: Uses simple XOR encryption
- Credentials stored in `~/.chaski/.secrets` (file permissions 0600)
- Encryption key derived from home directory path
- Keytar integration disabled due to environment issues
- For production, consider system keychain integration

### Cache Strategy

- **Initial load**: Fetches ALL messages in batches (50, then 500 at a time)
- **Subsequent refreshes**: Only fetches recent 200 messages, dedupes by UID
- **Inbox quick refresh**: Fetches last 100 messages per account
- **Cache invalidation**: Manual only (no TTL, no auto-expiry)
- **Progress tracking**: Shows "Loading X/Y messages" during initial load

### Auto-Refresh

- Configured in SettingsService (enabled/disabled, interval in minutes)
- Implemented in MessageList component via `useEffect` timer
- Only refreshes when folder is active/focused
- Timer resets on folder change

### Smooth Scrolling

EmailViewer implements custom smooth scrolling:

- Velocity-based scrolling (speed increases with held key)
- Acceleration/deceleration curves
- Handles large emails efficiently
- Uses internal scroll offset state

### Thread Detection

- Messages with `replies` array in mock data (legacy)
- Real threading via `inReplyTo` and `references` headers
- ThreadViewer paginates conversations
- Not fully implemented for live IMAP threading

### Error Handling

- Services throw errors, caught by App.tsx handlers
- Errors displayed via console.log (visible in terminal)
- RefreshStatus state tracks operation success/failure
- AssistantPanel shows error state for AI failures

## Common Pitfalls

1. **Forgetting to check `isFocused`**: Will cause multiple components to handle same key
2. **Not awaiting async service calls**: Can lead to stale UI state
3. **Modifying cache without updating cache metadata**: Folder counts become inaccurate
4. **Hardcoding file paths**: Always use `homedir()` and `join()` for cross-platform support
4b. **Hardcoding credentials/URLs/ports**: Always use `process.env` with defaults -- this is an open-source project
5. **Ignoring `commandInputActive`**: Causes command input conflicts
6. **Not updating `refreshTrigger`**: MessageList won't re-render after cache update

## Data Storage Locations

All data stored in `~/.chaski/`:

```
~/.chaski/
├── accounts.json         # Account configs (no secrets)
├── .secrets              # Encrypted credentials
├── settings.json         # User preferences
└── cache/
    └── messages.db       # SQLite message cache
```

## Environment Variables

All configurable via `.env` (loaded by `start.tsx` via dotenv). See `.env.example` for the full reference.

```bash
# OAuth2 provider credentials
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
OUTLOOK_CLIENT_ID=...
OUTLOOK_CLIENT_SECRET=...

# OAuth2 callback server (configurable port/path)
OAUTH_CALLBACK_PORT=3000          # Default: 3000
OAUTH_CALLBACK_PATH=/oauth2/callback  # Default: /oauth2/callback
OAUTH_REDIRECT_URI=               # Full override (optional, built from port+path if unset)

# AI Assistant
OPENAI_API_KEY=sk-...
```

**Important:** Never hardcode credentials, URLs, or ports. Always read from `process.env` with sensible defaults. The redirect URI used by OAuth2Service is built dynamically from `OAUTH_CALLBACK_PORT` and `OAUTH_CALLBACK_PATH` (or overridden entirely by `OAUTH_REDIRECT_URI`).

## Debugging

- Debug logs written to `debug.log` in project root (see `debugLog()` function)
- Enable via calls to `debugLog(component, message, data)` in code
- Log rotation not implemented (file grows indefinitely)
