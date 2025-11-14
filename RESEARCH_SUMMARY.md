# Claude Wrapper - Comprehensive Framework Research Summary

Research Date: November 14, 2025
Scope: TypeScript, Jest, Node.js CLI, OAuth 2.0, Cross-Platform Development

---

## Documentation Created

### 1. FRAMEWORK_RESEARCH.md (Primary Reference)
Comprehensive technical documentation covering:
- TypeScript 5.3+ configuration best practices
- OAuth 2.0 refresh token implementation patterns
- Cross-platform credential storage (Windows, macOS, Linux, WSL)
- Process spawning and signal handling
- Jest testing patterns for TDD
- Type definition patterns for token management
- Official references and best practices

**Key Sections:**
- TypeScript Configuration
- Jest Testing Framework & TDD
- Node.js CLI Development
- OAuth 2.0 Token Management
- Cross-Platform Development
- Process Spawning & Stdio Handling
- Type Definition Patterns
- Testing Patterns & Fixtures
- Implementation References

### 2. IMPLEMENTATION_GUIDE.md (Quick Reference)
Step-by-step implementation checklist with code examples:
- tsconfig.json and jest.config.js templates
- Core type definitions
- Token refresh implementation
- Authentication manager
- Platform adapter pattern
- Transparent process wrapper
- Binary entry point setup
- Package.json configuration
- Test structure with fixtures
- Installation and deployment procedures
- Troubleshooting guide
- Performance optimization tips
- Security verification checklist

**Practical Code Examples:**
- Complete TokenRefresher class
- AuthManager implementation
- Platform detection and adapters
- Process spawning with error handling
- Test structure with fixtures
- JWT and token handling

### 3. CODE_PATTERNS.md (Best Practices)
Detailed patterns showing good vs bad implementations:
- Token management patterns (6 patterns)
- Process spawning patterns (3 patterns)
- Type safety patterns (2 patterns)
- Testing patterns (2 patterns)
- Error handling patterns (2 patterns)
- Configuration patterns (1 pattern)
- Common anti-patterns (5 anti-patterns)
- Security patterns (3 patterns)

**Covers:**
- Proactive refresh with status checking
- Concurrent refresh deduplication
- Safe token storage with fallbacks
- Stdio inheritance for transparency
- Signal forwarding for Ctrl+C
- Error classification
- Type guards and discriminated unions
- Mock strategies and fixtures
- Categorized error hierarchy
- Exponential backoff retries
- Secure token comparison
- Input validation and sanitization
- File permission security

---

## Key Research Findings

### 1. TypeScript Configuration

**Best Practices for CLI Tools:**
- Target: ES2022 (modern Node.js)
- Module: NodeNext (automatic ESM/CJS selection)
- Enable skipLibCheck (performance critical)
- Use verbatimModuleSyntax (ESM/CJS clarity)
- Strict mode with noUncheckedIndexedAccess
- Enable incremental builds for development

### 2. OAuth 2.0 Implementation

**Token Lifetimes:**
- Access Token: 30 minutes (short-lived, limits compromise window)
- Refresh Token: 24 hours to 7 days
- Refresh Threshold: 5 minutes before expiry

**Security Requirements:**
- Concurrent refresh deduplication (prevent API storms)
- Proactive refresh before expiry (avoid runtime delays)
- Secure storage in OS credential vaults
- Never log or expose tokens
- Implement reuse detection if server supports it
- Use HTTPS for OAuth endpoint
- Validate refresh token responses

### 3. Node.js CLI Development

**Cross-Platform Compatibility:**
- Use cross-spawn (handles Windows command shims)
- stdio: 'inherit' for transparency
- Proper signal forwarding (SIGINT, SIGTERM)
- Exit code preservation
- Binary entry point with #!/usr/bin/env node shebang
- npm bin field creates platform-specific wrappers automatically

**Key Patterns:**
- Transparent wrapper: external tools can't distinguish from real CLI
- No output buffering or modification
- Complete subprocess I/O inheritance
- Proper error classification and recovery

### 4. Cross-Platform Credential Storage

**Platform-Specific Solutions:**

| Platform | Primary | Fallback |
|----------|---------|----------|
| Windows | Credential Manager | File (600 perms) |
| macOS | Keychain | File (600 perms) |
| Linux | libsecret/GNOME Keyring | File (600 perms) |
| WSL | Windows Credential Manager | libsecret |

**Secure File Fallback:**
- Permissions: 0o600 (rw-------)
- Encryption optional but recommended
- Single source of truth pattern

### 5. Testing Strategy

**Jest Configuration:**
- Preset: ts-jest
- Environment: node
- Coverage targets: 80% global, 95% critical paths
- Timeout: 10 seconds for integration tests
- Fixture factories for flexible test data
- Explicit mocking (not global jest.mock)

**Test Organization:**
- Unit tests for individual components
- Integration tests for token refresh flow
- End-to-end tests on all platforms
- Mock fixtures in dedicated folder

---

## Critical Implementation Notes

### OAuth Endpoint Details

```
Endpoint: https://console.anthropic.com/v1/oauth/token
Client ID: 9d1c250a-e61b-44d9-88ed-5944d1962f5e
Grant Type: refresh_token
Token Type: Bearer
```

### Binary Renaming Strategy

1. Rename original Claude CLI: `claude` → `claude-original`
2. Install wrapper as: `claude`
3. Wrapper intercepts, refreshes token, spawns `claude-original`
4. All I/O transparent to user and external tools

### Transparency Requirements

- stdio: 'inherit' (not 'pipe')
- No output modification or buffering
- Exit code preservation: `code || 0`
- Signal forwarding for Ctrl+C
- No visible overhead to user

### Security Checklist

- Refresh tokens in OS credential vault only
- File permissions 0o600 for fallback storage
- No tokens in console logs
- Constant-time token comparison (crypto.timingSafeEqual)
- Input validation and sanitization
- HTTPS for OAuth endpoint
- Environment variable overrides for secrets
- Never expose token in error messages

---

## Implementation Pattern Summary

### Recommended Patterns

1. **Proactive Refresh**: Check expiry before operations, refresh 5 min before
2. **Concurrent Deduplication**: Cache refresh promise to prevent duplicate calls
3. **Hybrid Storage**: Keychain primary, file fallback with fallback chain
4. **Transparent Wrapper**: stdio inheritance, no modification, exit code preservation
5. **Signal Forwarding**: Forward SIGINT/SIGTERM to child process
6. **Error Classification**: Categorized errors (TokenExpiredError, BinaryNotFoundError)
7. **Type Guards**: Runtime validation with TypeScript type guards
8. **Discriminated Unions**: Clear state representation with union types
9. **Fixture Factories**: Flexible test data creation without duplication
10. **Exponential Backoff**: Smart retry strategy with configurable delays

### Anti-Patterns to Avoid

1. **Plain Text Token Storage**: Always use OS credential vault
2. **Hardcoded Secrets**: Load from environment variables
3. **Token Logging**: Never log sensitive information
4. **No HTTP Timeout**: Always set timeout on API requests
5. **Blocking Event Loop**: Use async operations for heavy work
6. **Simple String Comparison**: Use crypto.timingSafeEqual
7. **No Input Validation**: Validate all user input
8. **Default File Permissions**: Always use mode: 0o600
9. **Global jest.mock**: Use explicit mocking with clear setup
10. **No Error Recovery**: Implement proper error handling with recovery

---

## Official References

### TypeScript
- Handbook: https://www.typescriptlang.org/docs/handbook/
- TSConfig Reference: https://www.typescriptlang.org/tsconfig
- TSConfig Cheat Sheet: https://www.totaltypescript.com/tsconfig-cheat-sheet

### Node.js
- Child Process: https://nodejs.org/api/child_process.html
- Process: https://nodejs.org/api/process.html
- CLI Guide: https://nodejs.org/api/cli.html

### Jest
- Official: https://jestjs.io/
- Configuration: https://jestjs.io/docs/configuration
- Mock Functions: https://jestjs.io/docs/mock-functions

### OAuth 2.0
- RFC 6749 (Authorization Framework): https://tools.ietf.org/html/rfc6749
- Security Best Current Practice: https://www.ietf.org/archive/id/draft-ietf-oauth-security-topics-29.html
- Refresh Token Guide: https://www.oauth.com/oauth2-servers/making-authenticated-requests/refreshing-an-access-token/

### Platform Credential Storage
- Windows: https://learn.microsoft.com/en-us/windows/win32/secauthn/credential-manager
- macOS: https://developer.apple.com/documentation/security/keychain
- Linux (libsecret): https://wiki.gnome.org/Projects/Libsecret
- WSL: https://learn.microsoft.com/en-us/windows/wsl/

---

## Recommended npm Packages

### Runtime
```json
{
  "axios": "^1.6.0",
  "cross-spawn": "^7.0.3",
  "keytar": "^7.9.0",
  "chalk": "^5.3.0",
  "commander": "^11.0.0",
  "dotenv": "^16.3.1",
  "yaml": "^2.3.4"
}
```

### Development
```json
{
  "typescript": "^5.3.0",
  "jest": "^29.7.0",
  "ts-jest": "^29.1.0",
  "@types/node": "^20.0.0",
  "@types/jest": "^29.5.0",
  "eslint": "^8.50.0",
  "prettier": "^3.1.0"
}
```

---

## Key Metrics

### Code Quality
- Lines of Implementation: ~2,500 TypeScript
- Test Coverage Target: 80% global, 95% critical paths
- Type Safety: Strict mode enabled
- Performance: <100ms overhead per CLI invocation

### Compatibility
- Node.js Version: 18+
- Platforms: Windows, macOS, Linux, WSL
- Module Format: ESM with CommonJS interop

### OAuth Performance
- Access Token Lifetime: 30 minutes
- Proactive Refresh: 5 minutes before expiry
- Background Check: Every 60 seconds
- API Efficiency: Concurrent request deduplication

---

## Project Structure

```
src/
├── bin/cli.ts                 # Entry point (#!/usr/bin/env node)
├── auth/
│   ├── types.ts              # Type definitions
│   ├── token.ts              # Token validation
│   ├── manager.ts            # Auth state management
│   ├── refresher.ts          # OAuth refresh flow
│   └── credentials.ts        # Credential storage
├── platform/
│   ├── types.ts              # Platform interfaces
│   ├── adapter.ts            # Platform detection
│   ├── windows-adapter.ts
│   ├── macos-adapter.ts
│   ├── linux-adapter.ts
│   └── wsl-adapter.ts
├── profiles/
│   └── manager.ts            # Multi-account support
├── config/
│   ├── types.ts
│   └── config.ts
├── cli/
│   └── manager.ts            # CLI commands
├── utils/
│   ├── logger.ts
│   └── errors.ts
├── wrapper.ts                # Main wrapper class
└── index.ts                  # Exports

tests/
├── unit/
│   ├── auth/
│   ├── platform/
│   └── utils/
├── integration/
├── mocks/
├── fixtures/
└── setup.ts
```

---

## Deployment Checklist

### Before Publishing
- [ ] All tests passing
- [ ] Coverage at 80%+
- [ ] TypeScript builds without errors
- [ ] No console errors or warnings
- [ ] Works on all 4 platforms
- [ ] No hardcoded secrets
- [ ] Security patterns implemented
- [ ] Error messages are helpful
- [ ] Documentation complete
- [ ] Version bumped

### Publishing
- [ ] Package.json metadata complete
- [ ] LICENSE file included
- [ ] README.md with examples
- [ ] CHANGELOG updated
- [ ] npm publish --access public

### Post-Deployment Monitoring
- Token refresh success rate (target: 99.9%)
- Performance overhead <100ms per invocation
- Cross-platform error reports
- User feedback on usability

---

## How to Use These Documents

### FRAMEWORK_RESEARCH.md
**Use when:**
- Starting implementation and need reference material
- Researching specific technology (OAuth, TypeScript, Jest, etc.)
- Looking for official documentation links
- Understanding architecture decisions

### IMPLEMENTATION_GUIDE.md
**Use when:**
- Actually writing code
- Need code templates and examples
- Setting up project structure
- Looking for quick solutions to common tasks
- Troubleshooting issues during development

### CODE_PATTERNS.md
**Use when:**
- Code review (checking for anti-patterns)
- Writing tests or security-sensitive code
- Designing error handling
- Making architecture decisions
- Learning best practices

---

## Success Metrics

### Functionality
- 99.9% token refresh success rate
- <100ms CLI overhead per invocation
- Full transparency (indistinguishable from real Claude CLI)
- Zero re-authentication required for token refresh

### Reliability
- All platforms supported (Windows, macOS, Linux, WSL)
- Graceful error recovery
- Proper signal handling
- Secure credential storage

### Code Quality
- 80%+ test coverage
- Strict TypeScript enabled
- Security patterns implemented
- Clear error messages

---

## Next Steps for Implementation

1. Start with `FRAMEWORK_RESEARCH.md` for architecture understanding
2. Use `IMPLEMENTATION_GUIDE.md` for code templates
3. Reference `CODE_PATTERNS.md` during development
4. Follow security checklist before deployment
5. Test on all platforms before release
6. Monitor success metrics post-deployment

