# Contributing to CC Profile Hub

Thank you for your interest in contributing to CC Profile Hub! This document provides guidelines for contributing to the project.

## Development Setup

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

```bash
git clone https://github.com/Jackson-Devices/cc-profile-hub.git
cd cc-profile-hub
npm install
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- tests/path/to/test.ts

# Run tests in watch mode
npm test -- --watch
```

### Building

```bash
# Build TypeScript to JavaScript
npm run build

# Run linter
npm run lint

# Fix linting issues
npm run lint:fix
```

## Development Guidelines

### Test-Driven Development (TDD)

We follow TDD practices:

1. **Red**: Write failing tests first
2. **Green**: Write minimal code to make tests pass
3. **Refactor**: Clean up code while keeping tests green

All new features must include comprehensive tests with 90%+ coverage.

### Code Style

- Use TypeScript strict mode
- Follow ESLint configuration
- Use descriptive variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused (single responsibility)

### Commit Messages

Follow conventional commits format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring
- `test`: Adding/updating tests
- `docs`: Documentation changes
- `chore`: Build/tooling changes

Examples:
```
feat(auth): add token rotation support
fix(logger): resolve request ID propagation issue
test(profile): improve StateManager coverage
```

### Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following TDD:
   - Write tests first
   - Implement feature
   - Ensure all tests pass
   - Verify coverage ≥ 90%

3. **Run quality checks**:
   ```bash
   npm test
   npm run lint
   npm run build
   ```

4. **Commit your changes** with clear commit messages

5. **Push to your fork** and create a pull request:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **PR Requirements**:
   - All tests passing
   - Coverage ≥ 90% on all metrics
   - No linting errors
   - Clear description of changes
   - Reference related issues

### Code Review

- Address all review comments
- Keep PR scope focused (one feature/fix per PR)
- Squash commits if requested
- Update documentation as needed

## Project Structure

```
cc-profile-hub/
├── src/                    # Source code
│   ├── auth/              # Authentication & token management
│   ├── config/            # Configuration loading
│   ├── crypto/            # Encryption utilities
│   ├── errors/            # Custom error classes
│   ├── profile/           # Profile management
│   ├── utils/             # Shared utilities
│   └── wrapper/           # Claude binary wrapper
├── tests/                 # Test files (mirrors src structure)
├── docs/                  # Documentation
└── package.json          # Dependencies and scripts
```

## Security

- Never commit sensitive data (tokens, credentials, keys)
- Use environment variables for configuration
- Follow secure coding practices
- File permissions: 0600 for token files
- Report security issues privately to maintainers

## Testing Best Practices

### Unit Tests

- Test one behavior per test case
- Use descriptive test names
- Arrange-Act-Assert pattern
- Mock external dependencies
- Clean up resources in `afterEach`

Example:
```typescript
describe('TokenStore', () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(async () => {
    tempDir = await createTempDir();
    store = new TokenStore(tempDir);
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it('should read valid token from file', async () => {
    // Arrange
    const tokenData = { accessToken: 'test-token', ... };
    await store.write('profile1', tokenData);

    // Act
    const result = await store.read('profile1');

    // Assert
    expect(result).toEqual(tokenData);
  });
});
```

### Coverage Requirements

- Statements: ≥ 90%
- Branches: ≥ 90%
- Functions: ≥ 90%
- Lines: ≥ 90%

## Questions?

- Open an issue for bugs or feature requests
- Check existing issues before creating new ones
- Provide detailed reproduction steps for bugs
- Include environment information (OS, Node version)

Thank you for contributing!
