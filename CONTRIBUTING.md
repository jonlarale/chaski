# Contributing to chaski

First off, thank you for considering contributing to chaski! It's people like you that make chaski such a great tool. This document provides guidelines and best practices for contributing to this project.

## Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [How Can I Contribute?](#how-can-i-contribute)
4. [Development Setup](#development-setup)
5. [Pull Request Process](#pull-request-process)
6. [Coding Standards](#coding-standards)
7. [Testing Guidelines](#testing-guidelines)
8. [Documentation](#documentation)
9. [Community](#community)

## Code of Conduct

### Our Pledge

We as members, contributors, and leaders pledge to make participation in our community a harassment-free experience for everyone, regardless of age, body size, visible or invisible disability, ethnicity, sex characteristics, gender identity and expression, level of experience, education, socio-economic status, nationality, personal appearance, race, religion, or sexual identity and orientation.

### Our Standards

Examples of behavior that contributes to a positive environment:

* Using welcoming and inclusive language
* Being respectful of differing viewpoints and experiences
* Gracefully accepting constructive criticism
* Focusing on what is best for the community
* Showing empathy towards other community members

Examples of unacceptable behavior:

* The use of sexualized language or imagery
* Trolling, insulting/derogatory comments, and personal attacks
* Public or private harassment
* Publishing others' private information without permission
* Other conduct which could reasonably be considered inappropriate

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** locally
3. **Create a branch** for your contribution
4. **Make your changes** and commit them
5. **Push to your fork** and submit a pull request

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When creating a bug report, please include:

* **Clear and descriptive title**
* **Steps to reproduce** the problem
* **Expected behavior** vs actual behavior
* **Screenshots** if applicable
* **System information** (OS, Node version, terminal)
* **Error messages** and stack traces
* **Configuration** that might be relevant

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

* **Use case** - Explain why this enhancement would be useful
* **Proposed solution** - Describe the desired behavior
* **Alternatives considered** - What other solutions did you consider?
* **Additional context** - Add any other context or screenshots

### Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:

* `good first issue` - Simple issues for beginners
* `help wanted` - Issues where we need community help
* `documentation` - Documentation improvements
* `bug` - Known bugs that need fixing

## Development Setup

### Prerequisites

* Node.js 16+ and npm
* Git
* A terminal with UTF-8 support
* (Optional) An email account for testing

### Setting Up Your Development Environment

```bash
# Fork and clone the repository
git clone https://github.com/yourusername/chaski.git
cd chaski

# Install dependencies
npm install

# Create a .env file for testing (optional)
cp .env.example .env
# Edit .env with your test credentials

# Start TypeScript compiler in watch mode
npm run dev

# In another terminal, run the app
npm start
```

### Project Structure Overview

```
chaski/
├── source/              # TypeScript source code
│   ├── app.tsx         # Main application component
│   ├── cli.tsx         # CLI entry point
│   ├── components/     # UI components
│   │   ├── MessageList.tsx
│   │   ├── FolderList.tsx
│   │   ├── EmailViewer.tsx
│   │   └── ...
│   ├── services/       # Business logic
│   │   ├── emailService.ts
│   │   ├── cacheService.ts
│   │   └── ...
│   ├── types/          # TypeScript definitions
│   └── constants/      # UI constants
├── dist/               # Compiled JavaScript
├── test/               # Test files
└── templates/          # Email templates
```

## Pull Request Process

### Before Submitting

1. **Update documentation** for any changed functionality
2. **Add tests** for new features or bug fixes
3. **Run the test suite** and ensure all tests pass:
   ```bash
   npm test
   ```
4. **Format your code** using Prettier:
   ```bash
   npm run prettier
   ```
5. **Lint your code** and fix any issues:
   ```bash
   npm run lint
   ```
6. **Build the project** to ensure it compiles:
   ```bash
   npm run build
   ```

### Pull Request Guidelines

1. **Create a descriptive title** - Use conventional commit format if possible:
   * `feat:` New feature
   * `fix:` Bug fix
   * `docs:` Documentation changes
   * `style:` Code style changes (formatting, etc.)
   * `refactor:` Code refactoring
   * `test:` Test additions or changes
   * `chore:` Maintenance tasks

2. **Write a comprehensive description** including:
   * What changes were made and why
   * Any breaking changes
   * Related issue numbers (fixes #123)
   * Screenshots for UI changes

3. **Keep PRs focused** - One feature/fix per PR

4. **Be responsive** to code review feedback

5. **Update from main** before merging to resolve conflicts

## Coding Standards

### TypeScript/JavaScript

* **Use TypeScript** for all new code
* **Follow existing patterns** in the codebase
* **Use meaningful variable names** - prefer clarity over brevity
* **Add type definitions** for all functions and complex data structures
* **Document complex logic** with inline comments
* **Use async/await** instead of callbacks
* **Handle errors properly** - never silently fail

### React/Ink Components

* **Use functional components** with hooks
* **Keep components small** and focused
* **Extract reusable logic** into custom hooks
* **Use proper prop types** with TypeScript interfaces
* **Memoize expensive computations** with useMemo
* **Handle loading and error states** appropriately

### File Organization

* **One component per file** (with few exceptions)
* **Group related files** in directories
* **Use index files** to simplify imports
* **Keep services separate** from UI components
* **Place types** in dedicated type files

### Code Style

We use Prettier and XO for code formatting and linting:

```json
{
  "prettier": {
    "singleQuote": true,
    "useTabs": true,
    "bracketSpacing": false
  }
}
```

### Best Practices

1. **Security First**
   * Never log sensitive information
   * Always validate user input
   * Use encryption for stored credentials
   * Follow OWASP guidelines

2. **Performance**
   * Optimize database queries
   * Implement proper caching strategies
   * Avoid blocking operations
   * Use pagination for large datasets

3. **User Experience**
   * Provide clear error messages
   * Show loading indicators
   * Implement keyboard shortcuts consistently
   * Maintain responsive UI

4. **Code Quality**
   * Write self-documenting code
   * Keep functions small (< 50 lines ideally)
   * Avoid deep nesting (max 3 levels)
   * Use early returns to reduce complexity
   * DRY (Don't Repeat Yourself)
   * SOLID principles

## Testing Guidelines

### Writing Tests

* **Test file naming**: `*.test.ts` or `*.test.tsx`
* **Use descriptive test names** that explain what is being tested
* **Follow AAA pattern**: Arrange, Act, Assert
* **Mock external dependencies** appropriately
* **Test edge cases** and error conditions
* **Aim for high coverage** but focus on meaningful tests

### Test Categories

1. **Unit Tests** - Test individual functions and components
2. **Integration Tests** - Test service interactions
3. **UI Tests** - Test component rendering and interactions

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run specific test file
npx ava source/services/emailService.test.ts
```

## Documentation

### Code Documentation

* **Add JSDoc comments** for public APIs:
  ```typescript
  /**
   * Fetches messages from the specified folder
   * @param accountId - The email account identifier
   * @param folder - The folder name (e.g., 'INBOX')
   * @param limit - Maximum number of messages to fetch
   * @returns Array of email messages
   * @throws {Error} If connection fails
   */
  async getMessages(accountId: string, folder: string, limit?: number): Promise<EmailMessage[]>
  ```

* **Document complex algorithms** with inline comments
* **Update README.md** for user-facing changes
* **Add to CHANGELOG.md** for significant changes

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Examples:
```
feat(email): add support for attachments
fix(cache): resolve memory leak in message caching
docs(readme): update installation instructions
refactor(ui): simplify message list component
```

## Community

### Getting Help

* **GitHub Issues** - For bugs and feature requests
* **Discussions** - For general questions and ideas
* **Email** - Contact the maintainer at jonlarale@gmail.com

### Recognition

Contributors will be recognized in:
* The project README
* Release notes
* A dedicated CONTRIBUTORS.md file

## Additional Resources

### Useful Links

* [Ink Documentation](https://github.com/vadimdemedes/ink)
* [TypeScript Handbook](https://www.typescriptlang.org/docs/)
* [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
* [Conventional Commits](https://www.conventionalcommits.org/)

### Development Tools

* [VS Code](https://code.visualstudio.com/) - Recommended editor
* [Node Inspector](https://nodejs.org/en/docs/guides/debugging-getting-started/) - For debugging
* [Postman](https://www.postman.com/) - For API testing

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Thank You!

Your contributions to open source, however small, make projects like this possible. Thank you for taking the time to contribute.

## Questions?

Feel free to contact the project maintainer:

**Jonathan Larraguivel Alemán**  
Email: jonlarale@gmail.com  
GitHub: [@jonlarale](https://github.com/jonlarale)

Happy coding! 🚀