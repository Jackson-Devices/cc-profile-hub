# Claude CLI Transparent Wrapper - Technical Specification

## Executive Summary

A transparent authentication proxy/wrapper for Claude CLI that:
- **Auto-refreshes OAuth tokens** seamlessly during operation
- **Manages multiple accounts** with instant switching
- **Works cross-platform** (Linux, macOS, Windows native, WSL)
- **Appears transparent** to both external tools and Claude CLI
- **Extensible** to support alternative LLM providers (future)

## Architecture Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  External Tool  │────▶│  Claude Wrapper  │────▶│   Claude CLI    │
│  (IDE, Script)  │◀────│   (Node.js)      │◀────│   (Official)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │   Auth Management    │
                    │  - Token Refresh     │
                    │  - Account Switch    │
                    │  - Profile Storage  │
                    └──────────────────────┘
```

## Core Components

### 1. Process Interceptor (`src/interceptor.ts`)
- **Purpose**: Intercepts Claude CLI launch and wraps execution
- **Features**:
  - Command line argument passthrough
  - Environment variable management
  - Process spawning with proper stdio handling
  - Exit code preservation

### 2. Authentication Manager (`src/auth/manager.ts`)
- **Purpose**: Handles OAuth token lifecycle
- **Features**:
  - Token expiry monitoring
  - Automatic refresh using refresh tokens
  - Credential file management
  - Multi-account profile switching

### 3. Token Refresher (`src/auth/refresher.ts`)
- **Purpose**: Implements OAuth refresh flow
- **Implementation**:
  ```typescript
  interface TokenData {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
  }
  
  class TokenRefresher {
    private readonly CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
    private readonly OAUTH_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
    
    async refreshToken(refreshToken: string): Promise<TokenData> {
      // Implements OAuth refresh flow
    }
  }
  ```

### 4. Profile Manager (`src/profiles/manager.ts`)
- **Purpose**: Manages multiple authentication profiles
- **Features**:
  - Profile CRUD operations
  - Atomic profile switching
  - Metadata management (email, nickname, last used)
  - Encrypted storage option

### 5. Platform Adapter (`src/platform/adapter.ts`)
- **Purpose**: Handles platform-specific differences
- **Implementations**:
  - `WindowsAdapter`: Native Windows paths, registry integration
  - `MacOSAdapter`: Keychain integration, macOS paths
  - `LinuxAdapter`: Standard Unix paths, secret storage
  - `WSLAdapter`: WSL-specific path translation

### 6. CLI Interface (`src/cli/interface.ts`)
- **Purpose**: Provides management commands
- **Commands**:
  - `claude-wrapper auth add` - Add new account
  - `claude-wrapper auth switch <profile>` - Switch account
  - `claude-wrapper auth list` - List profiles
  - `claude-wrapper auth refresh` - Force token refresh
  - `claude-wrapper config` - Configuration management

## Implementation Details

### Token Refresh Strategy

```typescript
class AutoRefreshStrategy {
  private refreshThreshold = 5 * 60 * 1000; // 5 minutes before expiry
  
  async ensureValidToken(): Promise<void> {
    const token = await this.loadCurrentToken();
    const now = Date.now();
    const expiresAt = token.expiresAt;
    
    // Refresh if token expires within threshold
    if (expiresAt - now < this.refreshThreshold) {
      const newToken = await this.refresher.refreshToken(token.refreshToken);
      await this.saveToken(newToken);
    }
  }
  
  // Background refresh for long-running sessions
  startBackgroundRefresh(): void {
    setInterval(async () => {
      await this.ensureValidToken();
    }, 60 * 1000); // Check every minute
  }
}
```

### Transparent Wrapping

```typescript
class ClaudeWrapper {
  async run(args: string[]): Promise<number> {
    // 1. Check/refresh authentication
    await this.authManager.ensureValidToken();
    
    // 2. Set up environment for Claude CLI
    const env = this.prepareEnvironment();
    
    // 3. Spawn actual Claude CLI process
    const claudeProcess = spawn('claude-original', args, {
      env,
      stdio: 'inherit', // Transparent I/O
      shell: false
    });
    
    // 4. Handle process lifecycle
    return new Promise((resolve) => {
      claudeProcess.on('exit', (code) => {
        resolve(code || 0);
      });
    });
  }
}
```

### Profile Storage Structure

```json
{
  "version": "1.0.0",
  "activeProfile": "work-account",
  "profiles": {
    "work-account": {
      "id": "work-account",
      "nickname": "Work",
      "email": "user@company.com",
      "credentialsPath": "~/.claude-wrapper/profiles/work-account/credentials.json",
      "settings": {
        "model": "claude-3-5-sonnet",
        "maxTokens": 4096
      },
      "metadata": {
        "createdAt": "2024-01-15T10:00:00Z",
        "lastUsed": "2024-01-15T14:30:00Z",
        "tokenRefreshCount": 42
      }
    }
  }
}
```

### Installation Strategy

1. **NPM Global Package**:
   ```bash
   npm install -g @community/claude-wrapper
   ```

2. **Binary Renaming**:
   - Rename original `claude` to `claude-original`
   - Install wrapper as `claude`
   - Wrapper calls `claude-original` internally

3. **PATH Manipulation** (alternative):
   - Install wrapper with higher PATH priority
   - Wrapper locates original claude in PATH

## Platform-Specific Considerations

### Windows
- Credential storage: Windows Credential Manager
- Path handling: Convert Unix paths to Windows paths
- Process spawning: Use `cross-spawn` for compatibility

### macOS
- Credential storage: macOS Keychain (optional)
- OAuth browser: Open with `open` command
- Security: Handle Gatekeeper and notarization

### Linux
- Credential storage: libsecret or file-based
- OAuth browser: Use `xdg-open`
- Permissions: Handle different package managers

### WSL
- Path translation: `/mnt/c/` ↔ `C:\`
- Browser launching: Use Windows browser from WSL
- Credential sharing: Optional Windows credential access

## Security Considerations

1. **Token Storage**:
   - Encrypt tokens at rest using `node-keytar` or platform keychains
   - File permissions: 600 (user read/write only)
   - Memory: Clear sensitive data after use

2. **Process Isolation**:
   - Don't log tokens or sensitive data
   - Use secure IPC for token refresh
   - Validate all inputs

3. **OAuth Security**:
   - Verify OAuth state parameter
   - Use PKCE for authorization flow
   - Validate redirect URIs

## Testing Strategy

### Unit Tests
```typescript
describe('TokenRefresher', () => {
  it('should refresh expired token', async () => {
    const oldToken = createExpiredToken();
    const newToken = await refresher.refresh(oldToken);
    expect(newToken.expiresAt).toBeGreaterThan(Date.now());
  });
  
  it('should not refresh valid token', async () => {
    const validToken = createValidToken();
    const result = await refresher.refresh(validToken);
    expect(result).toBe(validToken);
  });
});
```

### Integration Tests
- Test actual Claude CLI execution
- Test token refresh with mock OAuth server
- Test profile switching
- Test cross-platform compatibility

### E2E Tests
- Full workflow: auth → execute → refresh → execute
- Multi-profile scenarios
- Long-running session tests
- Network failure recovery

## Future Extensions

### Phase 2: Alternative LLM Providers
```typescript
interface LLMProvider {
  name: string;
  authenticate(): Promise<void>;
  execute(prompt: string): Promise<string>;
}

class OpenRouterProvider implements LLMProvider {
  // Implementation
}

class LiteLLMProvider implements LLMProvider {
  // Implementation
}
```

### Phase 3: Context Window Management
- Track token usage across providers
- Automatic model downgrade for large contexts
- Context compression strategies

### Phase 4: Advanced Features
- Team profile sharing
- Centralized auth server
- Usage analytics
- Cost tracking

## Development Roadmap

### MVP (Week 1-2)
- [x] Research Claude CLI authentication
- [ ] Basic wrapper implementation
- [ ] Token refresh mechanism
- [ ] Single profile support
- [ ] Linux/macOS support

### v1.0 (Week 3-4)
- [ ] Multi-profile management
- [ ] Windows support
- [ ] Comprehensive testing
- [ ] Documentation
- [ ] NPM package release

### v1.1 (Week 5-6)
- [ ] Keychain integration
- [ ] Background refresh
- [ ] WSL optimization
- [ ] Error recovery

### v2.0 (Month 2)
- [ ] Alternative LLM providers
- [ ] Context management
- [ ] Team features
- [ ] Enterprise support

## Configuration File

```yaml
# ~/.claude-wrapper/config.yaml
version: 1.0.0

# General settings
wrapper:
  logLevel: info
  refreshThreshold: 300  # seconds before expiry
  backgroundRefresh: true

# Authentication
auth:
  storage: keychain  # keychain | file | credential-manager
  encryption: true

# Profiles
profiles:
  default: work-account

# Provider settings (future)
providers:
  claude:
    enabled: true
    binary: claude-original
  openrouter:
    enabled: false
    apiKey: ${OPENROUTER_API_KEY}
  litellm:
    enabled: false
    endpoint: http://localhost:8000

# Advanced
advanced:
  interceptMode: rename  # rename | path
  debugMode: false
```

## Error Handling

```typescript
enum ErrorCode {
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  REFRESH_FAILED = 'REFRESH_FAILED',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  CLAUDE_NOT_FOUND = 'CLAUDE_NOT_FOUND',
}

class WrapperError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public recoverable: boolean = false
  ) {
    super(message);
  }
}

// Automatic recovery for certain errors
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRecoverable(error) || i === maxRetries - 1) throw error;
      await delay(1000 * Math.pow(2, i)); // Exponential backoff
    }
  }
}
```

## Success Metrics

1. **Transparency**: External tools can't distinguish wrapper from real CLI
2. **Reliability**: 99.9% token refresh success rate
3. **Performance**: <100ms overhead for command execution
4. **Compatibility**: Works on all major platforms
5. **Usability**: Zero-config for basic usage

## Dependencies

```json
{
  "dependencies": {
    "@types/node": "^20.0.0",
    "axios": "^1.6.0",
    "chalk": "^5.3.0",
    "commander": "^11.0.0",
    "cross-spawn": "^7.0.3",
    "dotenv": "^16.3.1",
    "keytar": "^7.9.0",
    "yaml": "^2.3.4"
  },
  "devDependencies": {
    "@types/jest": "^29.5.0",
    "eslint": "^8.50.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "typescript": "^5.3.0"
  }
}
```

## Conclusion

This wrapper design provides a robust, transparent solution for Claude CLI authentication management while laying the groundwork for future multi-provider support. The architecture prioritizes security, reliability, and user experience while maintaining full compatibility with existing tools and workflows.