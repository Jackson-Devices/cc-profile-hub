# Claude Wrapper - Comprehensive Framework & Technology Research

This document synthesizes best practices and implementation patterns from official documentation and community standards for the technologies powering the Claude Wrapper project.

## Table of Contents

1. [TypeScript 5.3+ Configuration](#typescript-53-configuration)
2. [Jest Testing Framework & TDD](#jest-testing-framework--tdd)
3. [Node.js CLI Development](#nodejs-cli-development)
4. [OAuth 2.0 Token Management](#oauth-20-token-management)
5. [Cross-Platform Development](#cross-platform-development)
6. [Process Spawning & Stdio Handling](#process-spawning--stdio-handling)
7. [Type Definition Patterns](#type-definition-patterns)
8. [Testing Patterns & Fixtures](#testing-patterns--fixtures)
9. [Implementation References](#implementation-references)

---

## TypeScript 5.3+ Configuration

### Best Practices for CLI Tools

**tsconfig.json Recommended Configuration:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": "./src",
    "outDir": "./dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "lib": ["ES2022"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Key Settings Explanation:**

- **target: "ES2022"**: Modern Node.js versions (14+) support ES2022, providing better performance than older targets
- **module: "NodeNext"**: Best option for Node.js CLI tools, automatically selects ES modules or CommonJS based on package.json "type"
- **moduleResolution: "NodeNext"**: Uses Node.js's actual module resolution algorithm
- **verbatimModuleSyntax: true**: Enforces correct ESM/CJS import syntax and prevents hidden module confusion
- **skipLibCheck: true**: Critical for performance - prevents checking all node_modules type definitions
- **isolatedModules: true**: Ensures files can be safely transpiled in isolation

**Performance Considerations:**

- Enable `incremental: true` for faster rebuilds during development
- Use `--incremental` flag with TypeScript compiler
- Only include necessary files with strict `include` and `exclude` patterns

### Type Safety for OAuth/Token Management

**Recommended Type Patterns:**

```typescript
// OAuth Token Type Definition Pattern
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;           // Unix timestamp in milliseconds
  scope?: string[];            // Array of granted scopes
  tokenType: 'Bearer';
  issuedAt?: number;
}

// Strict validation type
interface ValidatedTokenData extends TokenData {
  expiresAt: number;           // Required for validation
  refreshToken: string;        // Refresh token must be present
}

// Generic OAuth Client Configuration
interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
  tokenEndpoint: string;
}

// Type-safe refresh token response
interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;      // Optional per spec
  expires_in: number;          // Seconds until expiry
  scope?: string;
  token_type: 'Bearer';
}

// Utility type for token validation
type TokenStatus = 'valid' | 'expiring-soon' | 'expired' | 'refresh-required';

// Helper function with strict typing
function validateToken(token: TokenData): TokenStatus {
  const now = Date.now();
  const expiresInMs = token.expiresAt - now;
  const thresholdMs = 5 * 60 * 1000; // 5 minutes

  if (expiresInMs < 0) return 'expired';
  if (expiresInMs < thresholdMs) return 'expiring-soon';
  return 'valid';
}
```

**Module Organization Pattern:**

```
src/
├── auth/
│   ├── types.ts               // Type definitions and interfaces
│   ├── token.ts               // Token model with validation
│   ├── manager.ts             // Authentication state management
│   └── refresher.ts           // OAuth refresh token flow
├── platform/
│   ├── types.ts               // Platform-specific types
│   └── adapter.ts             // Cross-platform abstraction
├── utils/
│   ├── types.ts               // Utility types
│   └── logger.ts              // Logging with type safety
└── index.ts                   // Main entry point
```

---

## Jest Testing Framework & TDD

### Test Organization Patterns

**TDD Workflow - Red/Green/Refactor:**

1. **Red**: Write failing test describing desired behavior
2. **Green**: Implement minimal code to pass test
3. **Refactor**: Improve code without breaking tests

**Jest Configuration for CLI Tools:**

```javascript
// jest.config.js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  modulePaths: ['<rootDir>/src'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/types.ts'
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/auth/refresher.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  verbose: true
};
```

### Mock Strategies for OAuth Testing

**HTTP Request Mocking Pattern:**

```typescript
// tests/mocks/http-client.ts
export class MockHttpClient {
  private responses: Map<string, any> = new Map();

  mockResponse(path: string, response: any) {
    this.responses.set(path, response);
  }

  async post<T>(url: string, data: any, config?: any): Promise<T> {
    // Check mock first
    const mockResponse = this.responses.get(url);
    if (mockResponse) {
      return mockResponse;
    }
    throw new Error(`No mock configured for ${url}`);
  }
}

// In tests
describe('TokenRefresher', () => {
  let mockHttpClient: MockHttpClient;
  let refresher: TokenRefresher;

  beforeEach(() => {
    mockHttpClient = new MockHttpClient();
    refresher = new TokenRefresher(mockHttpClient);
  });

  it('should refresh expired token', async () => {
    const newToken = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer'
    };

    mockHttpClient.mockResponse(
      'https://console.anthropic.com/v1/oauth/token',
      newToken
    );

    const result = await refresher.refresh(expiredToken);
    expect(result.accessToken).toBe('new-access-token');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });
});
```

### Fixture Management Pattern

```typescript
// tests/fixtures/tokens.ts
export const createToken = (overrides: Partial<TokenData> = {}): TokenData => ({
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresAt: Date.now() + 3600000, // 1 hour from now
  scope: ['claude-api'],
  tokenType: 'Bearer',
  ...overrides
});

export const createExpiredToken = (): TokenData =>
  createToken({ expiresAt: Date.now() - 3600000 }); // 1 hour ago

export const createExpiringToken = (): TokenData =>
  createToken({ expiresAt: Date.now() + 2 * 60 * 1000 }); // 2 minutes

// Usage in tests
describe('TokenManager', () => {
  it('should refresh expiring token', async () => {
    const token = createExpiringToken();
    // Test implementation...
  });
});
```

### Coverage Configuration Strategy

**Tiered Coverage Thresholds:**

```javascript
coverageThreshold: {
  global: {
    branches: 75,      // General threshold
    functions: 75,
    lines: 75,
    statements: 75
  },
  // Critical path requires higher coverage
  './src/auth/refresher.ts': {
    branches: 95,      // OAuth refresh is critical
    functions: 95,
    lines: 95
  },
  // Platform adapters vary by complexity
  './src/platform/adapter.ts': {
    branches: 85,
    functions: 85,
    lines: 85
  }
}
```

---

## Node.js CLI Development

### Binary Creation with npm `bin` Field

**package.json Configuration:**

```json
{
  "name": "@community/claude-wrapper",
  "version": "1.0.0",
  "bin": {
    "claude": "./dist/bin/cli.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm test && npm run build"
  }
}
```

**Binary Entry Point Pattern:**

```typescript
// src/bin/cli.ts
#!/usr/bin/env node

/**
 * Shebang (#!/usr/bin/env node) is essential:
 * - Unix: Tells OS to execute with node interpreter
 * - Windows: npm creates .cmd wrapper automatically
 * - Allows global installation via npm
 */

import { ClaudeWrapper } from '../wrapper';
import { Logger } from '../utils/logger';

const logger = new Logger('claude-wrapper');

async function main() {
  try {
    const wrapper = new ClaudeWrapper();
    const exitCode = await wrapper.run(process.argv.slice(2));
    process.exit(exitCode);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
```

**Cross-Platform Binary Installation:**

On Windows, npm automatically creates three files:
- `claude.cmd` - For cmd.exe
- `claude` - For Cygwin/MSYS2
- `claude.ps1` - For PowerShell

On Unix:
- Symlink to executable script

### Transparent CLI Wrapper Pattern

**Process Spawning Strategy:**

```typescript
// src/wrapper.ts
import { spawn } from 'cross-spawn';
import { AuthManager } from './auth/manager';

class ClaudeWrapper {
  private authManager: AuthManager;

  async run(args: string[]): Promise<number> {
    // 1. Ensure token is valid and refresh if needed
    await this.authManager.ensureValidToken();

    // 2. Get current token and prepare environment
    const token = await this.authManager.getCurrentToken();
    const env = {
      ...process.env,
      CLAUDE_AUTH_TOKEN: token.accessToken,
      CLAUDE_PROFILE: await this.authManager.getCurrentProfile()
    };

    // 3. Spawn actual Claude CLI with transparent stdio
    const claudeProcess = spawn('claude-original', args, {
      env,
      stdio: 'inherit',        // Transparent I/O - user sees real output
      shell: process.platform === 'win32' ? true : false
    });

    // 4. Handle process lifecycle with proper exit code
    return new Promise((resolve, reject) => {
      claudeProcess.on('error', (error) => {
        if (error.code === 'ENOENT') {
          console.error('Error: claude-original binary not found');
          resolve(1);
        } else {
          reject(error);
        }
      });

      claudeProcess.on('exit', (code) => {
        resolve(code ?? 0);
      });
    });
  }
}
```

---

## OAuth 2.0 Token Management

### Refresh Token Best Practices (RFC 6749, Security BCP)

**Critical Security Patterns:**

```typescript
// src/auth/refresher.ts

interface RefreshTokenRequest {
  grant_type: 'refresh_token';
  refresh_token: string;
  client_id: string;
  client_secret: string;
}

interface RefreshTokenResponse {
  access_token: string;
  refresh_token?: string;           // Server may issue new refresh token
  expires_in: number;               // Seconds
  token_type: 'Bearer';
  scope?: string;
}

class TokenRefresher {
  private readonly OAUTH_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
  private readonly CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';

  /**
   * Refresh access token using refresh token
   *
   * Security considerations:
   * - Store refresh tokens in OS credential vault, not in config
   * - Use short-lived access tokens (30 minutes recommended)
   * - Validate token expiry before every request
   * - Implement reuse detection if server supports it
   */
  async refreshToken(
    refreshToken: string,
    clientSecret: string
  ): Promise<TokenData> {
    const payload: RefreshTokenRequest = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.CLIENT_ID,
      client_secret: clientSecret
    };

    try {
      const response = await axios.post<RefreshTokenResponse>(
        this.OAUTH_ENDPOINT,
        payload,
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000  // 10 second timeout
        }
      );

      // Convert server response to internal format
      return {
        accessToken: response.data.access_token,
        refreshToken: response.data.refresh_token || refreshToken, // Use new if provided
        expiresAt: Date.now() + (response.data.expires_in * 1000),
        tokenType: response.data.token_type,
        scope: response.data.scope?.split(' ')
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error('Invalid refresh token - re-authentication required');
        }
      }
      throw error;
    }
  }
}
```

### Proactive Refresh Strategy

```typescript
// src/auth/manager.ts

class AuthManager {
  // Time before expiry to trigger refresh (trade-off between safety and API calls)
  private readonly REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  async ensureValidToken(): Promise<string> {
    const token = await this.loadToken();

    if (!token) {
      throw new Error('No token found - please authenticate');
    }

    // Check if token needs refresh
    const now = Date.now();
    const timeUntilExpiry = token.expiresAt - now;

    if (timeUntilExpiry < this.REFRESH_THRESHOLD_MS) {
      // Proactively refresh before expiry
      const newToken = await this.tokenRefresher.refreshToken(
        token.refreshToken,
        token.clientSecret
      );

      await this.saveToken(newToken);
      return newToken.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Background refresh for long-running sessions
   *
   * Runs periodically to keep tokens fresh without blocking
   */
  startBackgroundRefresh(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        await this.ensureValidToken();
      } catch (error) {
        // Log but don't crash - background task
        console.warn('Background token refresh failed:', error);
      }
    }, 60 * 1000); // Check every minute
  }
}
```

### Token Expiry Recommendations

Based on OAuth 2.0 Security Best Current Practice (IETF):

- **Access Token Lifetime**: 15-30 minutes
  - Short-lived limits compromise window
  - Frequent refresh acceptable for CLI usage
  - Balance: Security vs. API call overhead

- **Refresh Token Lifetime**: 24 hours to 7 days
  - Longer than access token by multiple orders
  - Should support rotation if server implements it
  - User re-authentication required after expiry

```typescript
// Token lifetime strategy
const TOKEN_LIFETIMES = {
  accessToken: 30 * 60 * 1000,        // 30 minutes
  refreshToken: 24 * 60 * 60 * 1000,  // 24 hours
  refreshThreshold: 5 * 60 * 1000     // Refresh 5 min before expiry
};
```

---

## Cross-Platform Development

### Platform Detection & Adaptation

**Robust Platform Detection Pattern:**

```typescript
// src/platform/types.ts
export type PlatformType = 'windows' | 'macos' | 'linux' | 'wsl';

export interface PlatformAdapter {
  type: PlatformType;
  homeDir: string;
  configDir: string;

  saveCredential(service: string, account: string, password: string): Promise<void>;
  getCredential(service: string, account: string): Promise<string | null>;
  deleteCredential(service: string, account: string): Promise<void>;

  openBrowser(url: string): Promise<void>;
  executablePath(name: string): string;
}

// src/platform/adapter.ts
import { platform } from 'os';
import { existsSync } from 'fs';

export function getPlatformAdapter(): PlatformAdapter {
  const osType = platform();

  // Detect WSL (must check before generic Linux)
  if (process.env.WSL_DISTRO_NAME || existsSync('/proc/version')) {
    const procVersion = require('fs').readFileSync('/proc/version', 'utf-8');
    if (procVersion.toLowerCase().includes('microsoft')) {
      return new WSLAdapter();
    }
  }

  switch (osType) {
    case 'win32':
      return new WindowsAdapter();
    case 'darwin':
      return new MacOSAdapter();
    case 'linux':
      return new LinuxAdapter();
    default:
      throw new Error(`Unsupported platform: ${osType}`);
  }
}
```

### Windows Credential Manager Integration

**Windows-Specific Implementation:**

```typescript
// src/platform/windows-adapter.ts
import { execSync } from 'child_process';
import * as path from 'path';

export class WindowsAdapter implements PlatformAdapter {
  type: PlatformType = 'windows';

  homeDir = process.env.USERPROFILE || '';
  configDir = path.join(this.homeDir, 'AppData', 'Roaming', '.claude-wrapper');

  /**
   * Save credential to Windows Credential Manager
   *
   * Security: Credentials Manager stores encrypted secrets
   * Scope: Per-user, auto-protected by Windows security
   */
  async saveCredential(
    service: string,
    account: string,
    password: string
  ): Promise<void> {
    // Using cmdkey.exe (built-in Windows tool)
    const target = `${service}:${account}`;

    try {
      execSync(
        `cmdkey /add:${target} /user:${account} /pass:${password}`,
        { stdio: 'pipe' }
      );
    } catch (error) {
      throw new Error(`Failed to save credential: ${error}`);
    }
  }

  async getCredential(
    service: string,
    account: string
  ): Promise<string | null> {
    const target = `${service}:${account}`;

    try {
      // Query credential manager
      const result = execSync(`cmdkey /list:${target}`, {
        stdio: 'pipe',
        encoding: 'utf-8'
      });

      if (result.includes('GENERIC') || result.includes(account)) {
        // Use process.env to pass sensitive data
        return process.env[`CLAUDE_CRED_${account}`] || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  async openBrowser(url: string): Promise<void> {
    // Windows: use 'start' command
    execSync(`start "" "${url}"`, { stdio: 'pipe' });
  }
}
```

### macOS Keychain Integration

**macOS-Specific Implementation:**

```typescript
// src/platform/macos-adapter.ts
import { execSync } from 'child_process';
import * as path from 'path';

export class MacOSAdapter implements PlatformAdapter {
  type: PlatformType = 'macos';

  homeDir = process.env.HOME || '';
  configDir = path.join(this.homeDir, '.claude-wrapper');

  /**
   * Save credential to macOS Keychain
   *
   * Security: Macintosh Keychain uses OS-level encryption
   * Integration: User's login password locks/unlocks keychain
   * Access: Applications must have user permission once per session
   */
  async saveCredential(
    service: string,
    account: string,
    password: string
  ): Promise<void> {
    const secretText = Buffer.from(password).toString('base64');

    try {
      // Add to Keychain with security command
      execSync(
        [
          'security',
          'add-generic-password',
          '-s', service,
          '-a', account,
          '-w', password,
          '-U'  // Update if exists
        ].join(' '),
        { stdio: 'pipe' }
      );
    } catch (error) {
      throw new Error(`Failed to save to Keychain: ${error}`);
    }
  }

  async getCredential(
    service: string,
    account: string
  ): Promise<string | null> {
    try {
      const password = execSync(
        `security find-generic-password -s ${service} -a ${account} -w`,
        { stdio: 'pipe', encoding: 'utf-8' }
      ).trim();

      return password || null;
    } catch {
      return null;
    }
  }

  async openBrowser(url: string): Promise<void> {
    // macOS: use 'open' command
    execSync(`open "${url}"`, { stdio: 'pipe' });
  }
}
```

### Linux libsecret/Keyring Integration

**Linux-Specific Implementation:**

```typescript
// src/platform/linux-adapter.ts
import * as path from 'path';
import * as fs from 'fs/promises';
import { execSync } from 'child_process';

export class LinuxAdapter implements PlatformAdapter {
  type: PlatformType = 'linux';

  homeDir = process.env.HOME || '';
  configDir = path.join(this.homeDir, '.claude-wrapper');

  /**
   * Save credential to libsecret (GNOME Keyring / Secret Service)
   *
   * Fallback: File-based storage if libsecret unavailable
   * Security: File permissions 600 (owner read/write only)
   */
  async saveCredential(
    service: string,
    account: string,
    password: string
  ): Promise<void> {
    // Try libsecret first (better security)
    try {
      execSync(
        [
          'secret-tool',
          'store',
          '--label', `${service}:${account}`,
          service, account,
          password
        ].join(' '),
        { stdio: 'pipe' }
      );
      return;
    } catch (e) {
      // Fall back to file-based if libsecret unavailable
    }

    // File-based fallback (less secure but works everywhere)
    const credFile = path.join(
      this.configDir,
      'credentials',
      `${service}-${account}.txt`
    );

    await fs.mkdir(path.dirname(credFile), { recursive: true });
    await fs.writeFile(credFile, password, { mode: 0o600 });
  }

  async getCredential(
    service: string,
    account: string
  ): Promise<string | null> {
    // Try libsecret first
    try {
      const password = execSync(
        `secret-tool lookup ${service} ${account}`,
        { stdio: 'pipe', encoding: 'utf-8' }
      ).trim();

      if (password) return password;
    } catch {
      // Fall through to file-based
    }

    // Try file-based storage
    const credFile = path.join(
      this.configDir,
      'credentials',
      `${service}-${account}.txt`
    );

    try {
      return await fs.readFile(credFile, 'utf-8');
    } catch {
      return null;
    }
  }

  async openBrowser(url: string): Promise<void> {
    // Linux: try xdg-open first (standard), fall back to others
    const browsers = ['xdg-open', 'gnome-open', 'kde-open'];

    for (const browser of browsers) {
      try {
        execSync(`${browser} "${url}"`, { stdio: 'pipe' });
        return;
      } catch {
        // Try next browser
      }
    }

    throw new Error('Could not find browser to open URL');
  }
}
```

### WSL Path Translation

**Windows Subsystem for Linux Adapter:**

```typescript
// src/platform/wsl-adapter.ts
import { execSync } from 'child_process';

export class WSLAdapter implements PlatformAdapter {
  type: PlatformType = 'wsl';

  homeDir = process.env.HOME || '';

  // WSL stores config in Windows user directory via /mnt/c/
  get configDir(): string {
    const windowsHome = process.env.USERPROFILE || 'C:\\Users\\default';
    return this.windowsPathToWSL(
      windowsHome + '\\AppData\\Roaming\\.claude-wrapper'
    );
  }

  /**
   * WSL-specific path translation
   *
   * Example: C:\Users\name -> /mnt/c/Users/name
   */
  private windowsPathToWSL(winPath: string): string {
    return winPath
      .replace(/\\/g, '/')
      .replace(/^([a-zA-Z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
  }

  private wslPathToWindows(wslPath: string): string {
    return wslPath
      .replace(/^\/mnt\/([a-z])/, (_, drive) => `${drive.toUpperCase()}:`)
      .replace(/\//g, '\\');
  }

  /**
   * WSL credential access strategy:
   * 1. Use Windows Credential Manager via /mnt/c/
   * 2. Fall back to libsecret for Linux-specific secrets
   */
  async saveCredential(
    service: string,
    account: string,
    password: string
  ): Promise<void> {
    try {
      // Try Windows Credential Manager through WSL
      execSync(
        [
          '/mnt/c/Windows/System32/cmdkey.exe',
          `/add:${service}:${account}`,
          `/user:${account}`,
          `/pass:${password}`
        ].join(' '),
        { stdio: 'pipe' }
      );
    } catch {
      // Fall back to Linux libsecret
      await new LinuxAdapter().saveCredential(service, account, password);
    }
  }

  // Browser opening: Use Windows browser from WSL
  async openBrowser(url: string): Promise<void> {
    try {
      // Use Windows default browser
      execSync(
        `/mnt/c/Windows/System32/cmd.exe /c start "" "${url}"`,
        { stdio: 'pipe' }
      );
    } catch {
      // Fall back to Linux browsers
      const browsers = ['xdg-open', 'gnome-open', 'firefox'];
      for (const browser of browsers) {
        try {
          execSync(`${browser} "${url}"`, { stdio: 'pipe' });
          return;
        } catch {
          // Try next
        }
      }
      throw new Error('Could not find browser to open URL');
    }
  }
}
```

---

## Process Spawning & Stdio Handling

### Transparent Process Forwarding Pattern

**Complete Signal and Output Handling:**

```typescript
// src/wrapper.ts
import { spawn, SpawnOptions } from 'child_process';
import crossSpawn from 'cross-spawn';

export class ClaudeWrapper {
  /**
   * Spawn Claude CLI with complete transparency
   *
   * Key considerations:
   * - stdio: 'inherit' makes wrapper invisible to user
   * - Signal forwarding ensures Ctrl+C works
   * - Exit code preservation maintains script semantics
   */
  async runClaudeCLI(args: string[]): Promise<number> {
    const spawnOptions: SpawnOptions = {
      stdio: 'inherit',  // Inherit stdin, stdout, stderr
      shell: false,      // Don't spawn through shell (faster, safer)
      // On Windows, may need shell: true for certain executables
      ...(process.platform === 'win32' && { shell: true })
    };

    return new Promise((resolve, reject) => {
      // Use cross-spawn for Windows compatibility
      const child = crossSpawn('claude-original', args, spawnOptions);

      // Handle process errors
      child.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') {
          console.error('Error: claude-original binary not found');
          console.error(
            'Make sure to rename the original Claude CLI to "claude-original"'
          );
          resolve(127); // Command not found exit code
        } else {
          reject(error);
        }
      });

      // Forward exit code
      child.on('exit', (code: number | null, signal: string | null) => {
        // Handle both normal exit codes and signals
        if (signal) {
          // Child was killed by signal - re-raise signal
          process.kill(process.pid, signal);
          resolve(128 + process.signalToString(signal).charCodeAt(0));
        } else {
          resolve(code ?? 0);
        }
      });
    });
  }
}
```

### Signal Handling Pattern

**Proper Signal Forwarding:**

```typescript
// src/wrapper.ts

export class ClaudeWrapper {
  private childProcess: ChildProcess | null = null;

  async runWithSignalHandling(args: string[]): Promise<number> {
    const child = spawn('claude-original', args, {
      stdio: 'inherit',
      shell: false
    });

    this.childProcess = child;

    // Forward signals from parent to child
    // This allows Ctrl+C to work correctly
    const signalsToForward: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    signalsToForward.forEach((signal) => {
      process.on(signal, () => {
        if (this.childProcess && !this.childProcess.killed) {
          this.childProcess.kill(signal);
        }
      });
    });

    return new Promise((resolve) => {
      child.on('exit', (code, signal) => {
        // Clean up signal handlers
        signalsToForward.forEach((signal) => {
          process.removeAllListeners(signal);
        });

        resolve(code ?? 0);
      });

      child.on('error', (error) => {
        console.error('Child process error:', error.message);
        resolve(1);
      });
    });
  }
}
```

### stdio Options Reference

| Option | Use Case | Behavior |
|--------|----------|----------|
| `'inherit'` | Transparent wrapping | Stdin/stdout/stderr connected directly to parent |
| `'pipe'` | Capture output | Returns readable/writable streams for each |
| `'ignore'` | Suppress output | Discards all output |
| `[process.stdin, process.stdout, process.stderr]` | Explicit forwarding | Same as 'inherit' but explicit |

---

## Type Definition Patterns

### OAuth Token Type Hierarchy

```typescript
// src/auth/types.ts

/**
 * Raw response from OAuth server
 * Maps directly to server API
 */
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;        // Seconds
  scope?: string;            // Space-separated scopes
  token_type: string;        // Usually 'Bearer'
}

/**
 * Internal representation
 * Normalized and validated
 */
export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;         // Unix timestamp ms
  scope: string[];           // Split into array
  tokenType: 'Bearer';
  issuedAt: number;
  clientId: string;
}

/**
 * Token validation result
 * Discriminated union for type safety
 */
export type TokenValidationResult =
  | { valid: true; token: TokenData }
  | { valid: false; reason: 'expired' | 'invalid' | 'missing' };

/**
 * Storage representation
 * Includes metadata for debugging
 */
export interface StoredToken extends TokenData {
  storedAt: number;
  refreshCount: number;
  lastRefreshAttempt?: number;
}

// Helper functions with type guards
export function isValidToken(token: TokenData): boolean {
  const now = Date.now();
  return token.expiresAt > now + (5 * 60 * 1000); // Valid if > 5 min
}

export function needsRefresh(token: TokenData): boolean {
  const now = Date.now();
  const timeUntilExpiry = token.expiresAt - now;
  return timeUntilExpiry < (5 * 60 * 1000); // Refresh if < 5 min left
}

export function toOAuthFormat(token: TokenData): OAuthTokenResponse {
  return {
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_in: Math.floor((token.expiresAt - Date.now()) / 1000),
    scope: token.scope.join(' '),
    token_type: token.tokenType
  };
}
```

### Configuration Type Patterns

```typescript
// src/config/types.ts

export interface WrapperConfig {
  version: string;
  wrapper: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    refreshThreshold: number;    // Seconds before expiry
    backgroundRefresh: boolean;
  };
  auth: {
    storage: 'keychain' | 'file' | 'credential-manager';
    encryption: boolean;
  };
  profiles: {
    default: string;
  };
}

export interface Profile {
  id: string;
  nickname: string;
  email: string;
  settings: {
    model?: string;
    maxTokens?: number;
  };
  metadata: {
    createdAt: string;
    lastUsed?: string;
    tokenRefreshCount: number;
  };
}

// Type-safe config builder
export class ConfigBuilder {
  private config: WrapperConfig;

  constructor(defaults: Partial<WrapperConfig> = {}) {
    this.config = {
      version: '1.0.0',
      wrapper: {
        logLevel: 'info',
        refreshThreshold: 300,
        backgroundRefresh: true,
        ...defaults.wrapper
      },
      auth: {
        storage: 'file',
        encryption: true,
        ...defaults.auth
      },
      profiles: {
        default: 'default',
        ...defaults.profiles
      }
    };
  }

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): this {
    this.config.wrapper.logLevel = level;
    return this;
  }

  build(): WrapperConfig {
    return this.config;
  }
}
```

---

## Testing Patterns & Fixtures

### OAuth Flow Mocking

```typescript
// tests/mocks/oauth.ts

export class MockOAuthServer {
  private tokens: Map<string, any> = new Map();
  private callCount = 0;

  mockRefreshSuccess(
    refreshToken: string,
    response: Partial<OAuthTokenResponse> = {}
  ): void {
    this.tokens.set(refreshToken, {
      access_token: 'new-access-token',
      expires_in: 3600,
      token_type: 'Bearer',
      ...response
    });
  }

  mockRefreshFailure(refreshToken: string, statusCode = 401): void {
    this.tokens.set(`${refreshToken}:error`, {
      statusCode,
      error: 'invalid_grant'
    });
  }

  async handleRefreshRequest(
    refreshToken: string
  ): Promise<OAuthTokenResponse> {
    this.callCount++;

    const errorResponse = this.tokens.get(`${refreshToken}:error`);
    if (errorResponse) {
      const error = new Error('OAuth refresh failed');
      (error as any).statusCode = errorResponse.statusCode;
      throw error;
    }

    const response = this.tokens.get(refreshToken);
    if (!response) {
      throw new Error(`No mock configured for token: ${refreshToken}`);
    }

    return response;
  }

  getCallCount(): number {
    return this.callCount;
  }

  reset(): void {
    this.tokens.clear();
    this.callCount = 0;
  }
}

// Usage in tests
describe('TokenRefresher with OAuth', () => {
  let mockOAuth: MockOAuthServer;
  let refresher: TokenRefresher;

  beforeEach(() => {
    mockOAuth = new MockOAuthServer();
    refresher = new TokenRefresher(mockOAuth);
  });

  afterEach(() => {
    mockOAuth.reset();
  });

  it('should retry on transient failures', async () => {
    mockOAuth.mockRefreshFailure('token', 500); // Server error

    // Add retry logic to TokenRefresher first
    await expect(refresher.refresh('token')).rejects.toThrow();
    expect(mockOAuth.getCallCount()).toBe(1);
  });
});
```

### File System Mocking Pattern

```typescript
// tests/mocks/filesystem.ts
import * as memfs from 'memfs';

export class MockFileSystem {
  private vol: memfs.Volume;
  private originalFs: any;

  setUp(): void {
    this.vol = memfs.volume();
    this.vol.mkdirpSync('/.claude-wrapper');
    this.vol.mkdirpSync('/.claude-wrapper/profiles');

    // Override fs module
    this.originalFs = require('fs');
    jest.mock('fs', () => memfs.fs);
  }

  tearDown(): void {
    jest.unmock('fs');
  }

  writeProfile(id: string, profile: Partial<Profile> = {}): void {
    const fullProfile: Profile = {
      id,
      nickname: 'Test',
      email: 'test@example.com',
      settings: {},
      metadata: {
        createdAt: new Date().toISOString(),
        tokenRefreshCount: 0
      },
      ...profile
    };

    this.vol.writeFileSync(
      `/.claude-wrapper/profiles/${id}.json`,
      JSON.stringify(fullProfile),
      'utf-8'
    );
  }

  readProfile(id: string): Profile | null {
    try {
      const data = this.vol.readFileSync(
        `/.claude-wrapper/profiles/${id}.json`,
        'utf-8'
      );
      return JSON.parse(data as string);
    } catch {
      return null;
    }
  }
}
```

### Integration Test Pattern

```typescript
// tests/integration/token-refresh.test.ts

describe('Token Refresh Integration', () => {
  let wrapper: ClaudeWrapper;
  let mockOAuth: MockOAuthServer;
  let mockFs: MockFileSystem;

  beforeEach(() => {
    mockFs = new MockFileSystem();
    mockFs.setUp();

    mockOAuth = new MockOAuthServer();
    wrapper = new ClaudeWrapper(mockOAuth);
  });

  afterEach(() => {
    mockFs.tearDown();
  });

  it('should auto-refresh token during execution', async () => {
    // Set up expiring token
    const expiringToken = createExpiringToken();
    await wrapper.saveToken(expiringToken);

    // Mock successful refresh
    mockOAuth.mockRefreshSuccess(
      expiringToken.refreshToken,
      { access_token: 'refreshed-token' }
    );

    // Trigger refresh
    await wrapper.ensureValidToken();

    // Verify new token was saved
    const savedToken = await wrapper.getCurrentToken();
    expect(savedToken.accessToken).toBe('refreshed-token');
  });
});
```

---

## Implementation References

### Official Documentation Links

**TypeScript:**
- TypeScript Handbook: https://www.typescriptlang.org/docs/handbook/
- TSConfig Reference: https://www.typescriptlang.org/tsconfig
- Module Resolution: https://www.typescriptlang.org/docs/handbook/modules/

**Jest:**
- Jest Official: https://jestjs.io/
- Jest Configuration: https://jestjs.io/docs/configuration
- Mock Functions: https://jestjs.io/docs/mock-functions

**Node.js:**
- Child Process API: https://nodejs.org/api/child_process.html
- Process: https://nodejs.org/api/process.html
- CLI Guide: https://nodejs.org/api/cli.html

**OAuth 2.0:**
- RFC 6749 (OAuth 2.0 Authorization Framework): https://tools.ietf.org/html/rfc6749
- Security Best Current Practice: https://www.ietf.org/archive/id/draft-ietf-oauth-security-topics-29.html
- OAuth 2.0 Refresh Token Documentation: https://www.oauth.com/oauth2-servers/making-authenticated-requests/refreshing-an-access-token/

**Platform-Specific:**
- Windows Credential Manager: https://learn.microsoft.com/en-us/windows/win32/secauthn/credential-manager
- macOS Keychain: https://developer.apple.com/documentation/security/keychain
- GNOME Keyring / libsecret: https://wiki.gnome.org/Projects/Libsecret
- WSL Documentation: https://learn.microsoft.com/en-us/windows/wsl/

### Recommended npm Packages

```json
{
  "dependencies": {
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
    "@types/node": "^20.0.0",
    "eslint": "^8.50.0",
    "jest": "^29.7.0",
    "prettier": "^3.1.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  }
}
```

### Key Files to Create

```
claude-wrapper/
├── src/
│   ├── bin/
│   │   └── cli.ts                # Entry point with shebang
│   ├── auth/
│   │   ├── types.ts              # OAuth type definitions
│   │   ├── token.ts              # Token validation & helpers
│   │   ├── manager.ts            # Auth state management
│   │   ├── refresher.ts          # OAuth refresh implementation
│   │   └── credentials.ts        # Credential file handling
│   ├── platform/
│   │   ├── types.ts              # Platform abstractions
│   │   ├── adapter.ts            # Platform factory
│   │   ├── windows-adapter.ts
│   │   ├── macos-adapter.ts
│   │   ├── linux-adapter.ts
│   │   └── wsl-adapter.ts
│   ├── profiles/
│   │   └── manager.ts            # Profile management
│   ├── config/
│   │   ├── types.ts
│   │   └── config.ts
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── auth.ts
│   │   │   ├── profile.ts
│   │   │   └── config.ts
│   │   └── manager.ts
│   ├── utils/
│   │   ├── logger.ts
│   │   └── errors.ts
│   ├── wrapper.ts               # Main wrapper class
│   └── index.ts                 # Exports
├── tests/
│   ├── unit/
│   │   ├── auth/
│   │   ├── platform/
│   │   └── utils/
│   ├── integration/
│   │   └── token-refresh.test.ts
│   ├── mocks/
│   │   ├── oauth.ts
│   │   └── filesystem.ts
│   ├── fixtures/
│   │   ├── tokens.ts
│   │   └── profiles.ts
│   └── setup.ts
├── jest.config.js
├── tsconfig.json
├── package.json
└── README.md
```

---

## Summary of Best Practices

### Security First
- Store refresh tokens in OS credential vaults (Keychain, Credential Manager, libsecret)
- Use short-lived access tokens (30 minutes)
- Implement token refresh threshold (5 minutes before expiry)
- Never log or expose tokens in console/error messages
- Use process isolation and secure IPC

### Performance
- Proactive token refresh to avoid runtime delays
- Background refresh for long-running sessions
- Skip unnecessary type checking (`skipLibCheck`)
- Use incremental builds during development
- Cache token state to minimize disk I/O

### Compatibility
- Use `cross-spawn` for Windows command handling
- Test on all target platforms (Windows, macOS, Linux, WSL)
- Implement platform detection and fallbacks
- Handle both ESM and CommonJS module formats
- Account for shell differences (PowerShell vs Bash)

### Code Quality
- Enable strict TypeScript checking
- Maintain 80%+ test coverage on critical paths
- Follow TDD (Red/Green/Refactor) workflow
- Use type-safe configuration patterns
- Implement proper error boundaries with recovery

### User Experience
- Make wrapper completely transparent (stdio inheritance)
- Support Ctrl+C and signal forwarding
- Preserve exit codes for scripting
- Provide clear error messages with recovery steps
- Zero-config for basic usage, optional advanced config

