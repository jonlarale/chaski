# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**chaski** is a terminal-based email client built with Ink (React for CLIs) and TypeScript. Currently a proof-of-concept with mock data, providing a polished UI/UX for terminal email management.

## Essential Commands

```bash
# Development
npm start         # Run the application directly
npm run dev       # TypeScript compiler in watch mode
npm run build     # Compile TypeScript to dist/

# Code Quality (run before committing)
npm test          # Runs prettier, xo linter, and ava tests in sequence
```

## Architecture

### Component Structure & Navigation Flow

The app uses a state-based navigation system with three views:

1. **Main View** (default)

   - `FolderList` (left): Email folders with account breakdown
   - `MessageList` (right): Emails for selected folder/account
   - Focus toggles between panels with Tab key

2. **Email View**

   - `EmailViewer`: Full-screen email reader with smooth scrolling
   - Triggered by Enter/→ on a message

3. **Thread View**
   - `ThreadViewer`: Conversation display with pagination
   - Triggered when opening a message with replies

### Key State Management in App.tsx

```typescript
// View modes
const [currentView, setCurrentView] = useState<'main' | 'email' | 'thread'>(
	'main',
);

// Focus management for main view
const [focusedComponent, setFocusedComponent] = useState<
	'folders' | 'messages'
>('folders');

// Selected items
const [selectedFolder, setSelectedFolder] = useState('INBOX');
const [selectedAccount, setSelectedAccount] = useState('');
const [selectedMessage, setSelectedMessage] = useState(null);
```

### Component Communication Pattern

- Parent (App) manages global state and navigation
- Children receive props for:
  - `isFocused`: Whether component should handle keyboard input
  - Selection callbacks: `onFolderSelect`, `onMessageSelect`, etc.
  - Navigation callbacks: `onBack`, `onQuit`

### Mock Data Structure

All components use hardcoded mock data:

- 3 email accounts across 5 folders (INBOX, SENT, DRAFTS, SPAM, TRASH)
- Sample messages with threading support
- No real email integration implemented

## Development Guidelines

### Code Style

- Uses tabs for indentation (Prettier config)
- Single quotes for strings
- No semicolons except where required
- React functional components with TypeScript

### Adding New Features

When implementing real email functionality:

1. Replace mock data in components with data from email service
2. Add email service layer between App and components
3. Consider state management library for complex state
4. Implement IMAP/SMTP integration in separate service modules

### Testing Approach

- Component tests use `ink-testing-library`
- Test file pattern: `*.test.tsx` or `test.tsx`
- Run individual tests with AVA's filter: `npx ava test.tsx -m "*pattern*"`

### Common Tasks

**Add a new keyboard shortcut:**

1. Update `useInput` hook in relevant component
2. Add handler for new key
3. Update CommandBar navigation instructions

**Add a new view mode:**

1. Add to `currentView` type in App.tsx
2. Create new component in `source/components/`
3. Add case in App's render switch statement
4. Handle navigation to/from new view

**Modify email list display:**

- Edit `MessageList.tsx` component
- Message rendering starts at line ~97
- Update `IMessage` interface for new fields

## Important Implementation Notes

1. **Focus Management**: Only the focused component receives keyboard input. Always check `isFocused` prop before handling keys.

2. **Scrolling in EmailViewer**: Uses custom smooth scrolling with velocity management. See `handleScroll` function for implementation details.

3. **Thread Detection**: Messages with `replies` array are treated as threads. ThreadViewer handles pagination for long conversations.

4. **Exit Strategy**: ESC key is the global quit command, handled at App level.

5. **No CLI Integration**: The `cli.tsx` file exists but isn't connected. Current entry point is `app.tsx` directly.

## Email Caching System

The app now includes a SQLite-based caching system for improved performance:

**Cache Commands:**

- `/refresh` or `/r` - Refresh current folder
- `/refresh-all` - Refresh all folders (not fully implemented)
- `/refresh-inbox` - Quick refresh inbox only
- `/cache-status` - Show cache statistics
- `/cache-clear` - Clear all cached data

**Cache Location:** `~/.chaski/cache/messages.db`

**How it works:**

1. On first load, messages are fetched from cache (instant)
2. Cache shows age indicator: `[Cached 5m ago]`
3. Use `/refresh` to manually update with latest emails
4. Cache is automatically updated when fetching from IMAP
