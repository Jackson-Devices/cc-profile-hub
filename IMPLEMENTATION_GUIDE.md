# Claude Wrapper - Quick Implementation Guide

Fast-reference guide for implementing the Claude Wrapper using established patterns and best practices.

## Quick Start Checklist

- [ ] Initialize project with correct TypeScript configuration
- [ ] Set up Jest with proper test structure
- [ ] Implement core token refresh logic
- [ ] Add platform detection and credential storage
- [ ] Build transparent process wrapper
- [ ] Implement CLI management interface
- [ ] Add comprehensive test coverage
- [ ] Test on all platforms (Windows, macOS, Linux, WSL)

---

## 1. TypeScript Configuration

**Create `tsconfig.json`:**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
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
    "noImplicitOverride": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Create `jest.config.js`:**

```javascript
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
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    },
    './src/auth/refresher.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  verbose: true,
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
};
```

---

## 2. Core Type Definitions

**File: `src/auth/types.ts`**

```typescript
export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
}

export interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
  tokenType: 'Bearer';
  issuedAt: number;
  clientId: string;
}

export interface StoredToken extends TokenData {
  storedAt: number;
  refreshCount: number;
}

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenEndpoint: string;
}

// Helper type for validation
export type TokenStatus = 'valid' | 'expiring-soon' | 'expired';

// Type guards
export function isValidToken(token: TokenData): boolean {
  return token.expiresAt > Date.now() + 5 * 60 * 1000;
}

export function getTokenStatus(token: TokenData): TokenStatus {
  const now = Date.now();
  const timeUntilExpiry = token.expiresAt - now;

  if (timeUntilExpiry < 0) return 'expired';
  if (timeUntilExpiry < 5 * 60 * 1000) return 'expiring-soon';
  return 'valid';
}
```

---

## 3. Token Refresh Implementation

**File: `src/auth/refresher.ts`**

```typescript
import axios from 'axios';
import { OAuthTokenResponse, TokenData, OAuthClientConfig } from './types';

export class TokenRefresher {
  private readonly OAUTH_ENDPOINT = 'https://console.anthropic.com/v1/oauth/token';
  private readonly REQUEST_TIMEOUT = 10000; // 10 seconds

  constructor(private config: OAuthClientConfig) {}

  async refreshToken(
    refreshToken: string
  ): Promise<TokenData> {
    const payload = {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret
    };

    try {
      const response = await axios.post<OAuthTokenResponse>(
        this.OAUTH_ENDPOINT,
        payload,
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: this.REQUEST_TIMEOUT
        }
      );

      return this.mapResponseToToken(response.data);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          throw new Error(
            'Invalid refresh token - authentication required'
          );
        }
        if (error.code === 'ECONNABORTED') {
          throw new Error('Token refresh timeout - network issue');
        }
      }
      throw error;
    }
  }

  private mapResponseToToken(response: OAuthTokenResponse): TokenData {
    return {
      accessToken: response.access_token,
      refreshToken: response.refresh_token || '', // Keep existing if not returned
      expiresAt: Date.now() + (response.expires_in * 1000),
      scope: response.scope?.split(' ') || [],
      tokenType: 'Bearer',
      issuedAt: Date.now(),
      clientId: this.config.clientId
    };
  }
}
```

---

## 4. Authentication Manager

**File: `src/auth/manager.ts`**

```typescript
import { TokenData, getTokenStatus } from './types';
import { TokenRefresher } from './refresher';
import { Credentials } from './credentials';

export class AuthManager {
  private readonly REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
  private currentToken: TokenData | null = null;
  private backgroundRefreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private refresher: TokenRefresher,
    private credentials: Credentials
  ) {}

  async loadToken(): Promise<TokenData | null> {
    const stored = await this.credentials.getToken();
    if (stored) {
      this.currentToken = stored;
    }
    return this.currentToken;
  }

  async ensureValidToken(): Promise<string> {
    const token = await this.loadToken();

    if (!token) {
      throw new Error('No token found - authentication required');
    }

    const status = getTokenStatus(token);

    if (status === 'expired') {
      throw new Error('Token expired - re-authentication required');
    }

    if (status === 'expiring-soon') {
      // Refresh before use
      const newToken = await this.refresher.refreshToken(
        token.refreshToken
      );
      await this.credentials.saveToken(newToken);
      this.currentToken = newToken;
      return newToken.accessToken;
    }

    return token.accessToken;
  }

  startBackgroundRefresh(): void {
    if (this.backgroundRefreshInterval) {
      return; // Already running
    }

    this.backgroundRefreshInterval = setInterval(async () => {
      try {
        await this.ensureValidToken();
      } catch (error) {
        // Log but don't crash
        console.warn('Background token refresh failed:', error);
      }
    }, 60 * 1000); // Check every minute
  }

  stopBackgroundRefresh(): void {
    if (this.backgroundRefreshInterval) {
      clearInterval(this.backgroundRefreshInterval);
      this.backgroundRefreshInterval = null;
    }
  }

  getCurrentToken(): TokenData | null {
    return this.currentToken;
  }
}
```

---

## 5. Platform Adapter Pattern

**File: `src/platform/types.ts`**

```typescript
export type PlatformType = 'windows' | 'macos' | 'linux' | 'wsl';

export interface PlatformAdapter {
  type: PlatformType;
  homeDir: string;
  configDir: string;

  saveCredential(
    service: string,
    account: string,
    password: string
  ): Promise<void>;

  getCredential(
    service: string,
    account: string
  ): Promise<string | null>;

  deleteCredential(
    service: string,
    account: string
  ): Promise<void>;

  openBrowser(url: string): Promise<void>;
}
```

**File: `src/platform/adapter.ts`**

```typescript
import { platform } from 'os';
import { existsSync, readFileSync } from 'fs';
import { WindowsAdapter } from './windows-adapter';
import { MacOSAdapter } from './macos-adapter';
import { LinuxAdapter } from './linux-adapter';
import { WSLAdapter } from './wsl-adapter';
import { PlatformAdapter } from './types';

export function getPlatformAdapter(): PlatformAdapter {
  // Check for WSL first (before generic Linux)
  if (isWSL()) {
    return new WSLAdapter();
  }

  const osType = platform();

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

function isWSL(): boolean {
  try {
    // Check WSL environment variables
    if (process.env.WSL_DISTRO_NAME || process.env.WSL_HOST) {
      return true;
    }

    // Check /proc/version for Microsoft string
    if (existsSync('/proc/version')) {
      const procVersion = readFileSync('/proc/version', 'utf-8');
      return procVersion.toLowerCase().includes('microsoft');
    }

    return false;
  } catch {
    return false;
  }
}

export { PlatformAdapter };
```

---

## 6. Transparent Process Wrapper

**File: `src/wrapper.ts`**

```typescript
import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { AuthManager } from './auth/manager';

export class ClaudeWrapper {
  constructor(private authManager: AuthManager) {}

  async run(args: string[]): Promise<number> {
    // Ensure token is valid
    try {
      const token = await this.authManager.ensureValidToken();
    } catch (error) {
      console.error('Authentication error:', error);
      return 1;
    }

    // Prepare environment
    const env = {
      ...process.env,
      CLAUDE_AUTH_TOKEN: token,
      FORCE_COLOR: '1' // Preserve colors in piped output
    };

    // Spawn Claude CLI with transparent stdio
    return new Promise((resolve) => {
      const child = crossSpawn('claude-original', args, {
        env,
        stdio: 'inherit',
        shell: process.platform === 'win32'
      });

      child.on('error', (error: any) => {
        if (error.code === 'ENOENT') {
          console.error(
            'Error: claude-original binary not found\n' +
            'Install: npm install -g @community/claude-wrapper\n' +
            'Then: mv $(which claude) $(which claude)-original'
          );
          resolve(127);
        } else {
          console.error('Failed to spawn Claude:', error);
          resolve(1);
        }
      });

      child.on('exit', (code: number | null) => {
        resolve(code ?? 0);
      });
    });
  }
}
```

---

## 7. Binary Entry Point

**File: `src/bin/cli.ts`**

```typescript
#!/usr/bin/env node

import { ClaudeWrapper } from '../wrapper';
import { Logger } from '../utils/logger';

const logger = new Logger('claude-wrapper');

async function main() {
  try {
    const wrapper = new ClaudeWrapper(
      // Initialize dependencies here
    );

    const exitCode = await wrapper.run(process.argv.slice(2));
    process.exit(exitCode);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
```

**Note:** The shebang (`#!/usr/bin/env node`) is critical and must be on line 1.

---

## 8. Package Configuration

**File: `package.json`**

```json
{
  "name": "@community/claude-wrapper",
  "version": "1.0.0",
  "description": "Transparent OAuth wrapper for Claude CLI",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "bin": {
    "claude": "./dist/bin/cli.js"
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint src tests",
    "prepublishOnly": "npm run build && npm test"
  },
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
    "@types/cross-spawn": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.50.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

---

## 9. Test Structure

**File: `tests/setup.ts`**

```typescript
// Global test setup
import { TextEncoder, TextDecoder } from 'util';

Object.assign(global, {
  TextEncoder,
  TextDecoder
});

// Suppress console output in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};
```

**File: `tests/unit/auth/refresher.test.ts`**

```typescript
import { TokenRefresher } from '../../../src/auth/refresher';
import { OAuthClientConfig, TokenData } from '../../../src/auth/types';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TokenRefresher', () => {
  let refresher: TokenRefresher;
  const config: OAuthClientConfig = {
    clientId: 'test-client',
    clientSecret: 'test-secret',
    redirectUri: 'http://localhost:3000/callback',
    tokenEndpoint: 'https://console.anthropic.com/v1/oauth/token'
  };

  beforeEach(() => {
    jest.clearAllMocks();
    refresher = new TokenRefresher(config);
  });

  it('should refresh token successfully', async () => {
    const mockResponse = {
      access_token: 'new-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer'
    };

    mockedAxios.post.mockResolvedValueOnce({ data: mockResponse });

    const result = await refresher.refreshToken('old-refresh');

    expect(result.accessToken).toBe('new-token');
    expect(result.expiresAt).toBeGreaterThan(Date.now());
  });

  it('should handle refresh token expiry', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { status: 401 }
    });

    await expect(refresher.refreshToken('expired-refresh')).rejects.toThrow(
      'Invalid refresh token'
    );
  });
});
```

**File: `tests/fixtures/tokens.ts`**

```typescript
import { TokenData } from '../../src/auth/types';

export function createToken(
  overrides: Partial<TokenData> = {}
): TokenData {
  return {
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600000,
    scope: ['claude-api'],
    tokenType: 'Bearer',
    issuedAt: Date.now(),
    clientId: 'test-client',
    ...overrides
  };
}

export function createExpiredToken(): TokenData {
  return createToken({ expiresAt: Date.now() - 3600000 });
}

export function createExpiringToken(): TokenData {
  return createToken({ expiresAt: Date.now() + 2 * 60 * 1000 });
}

export function createValidToken(): TokenData {
  return createToken({ expiresAt: Date.now() + 24 * 3600000 });
}
```

---

## 10. Installation & Testing Workflow

**Development Installation:**

```bash
# Clone and setup
git clone <repo> claude-wrapper
cd claude-wrapper
npm install

# Build TypeScript
npm run build

# Run tests
npm test
npm run test:coverage

# Link for local testing
npm link

# Test with actual Claude CLI
claude-wrapper auth status
```

**Testing on Different Platforms:**

| Platform | Setup | Test |
|----------|-------|------|
| **Linux** | `npm install` | `npm test` |
| **macOS** | `npm install` | `npm test` |
| **Windows** | `npm install` | `npm test` (PowerShell) |
| **WSL** | `npm install` in WSL | `npm test` in WSL |

**End-to-End Test:**

```bash
# 1. Find original Claude binary
which claude  # Unix/WSL
where.exe claude  # Windows

# 2. Rename it
mv $(which claude) $(which claude)-original  # Unix/WSL

# 3. Link wrapper
npm link

# 4. Test transparency
claude --version
claude chat "Hello"

# 5. Test token refresh (requires valid credentials)
claude-wrapper auth refresh
claude chat "Test token refresh"
```

---

## 11. Troubleshooting Common Issues

**Issue: "claude-original binary not found"**

```bash
# Solution: Rename the original Claude CLI
mv /usr/local/bin/claude /usr/local/bin/claude-original

# Or on Windows:
mv "C:\Program Files\Anthropic\Claude\claude.exe" "C:\Program Files\Anthropic\Claude\claude-original.exe"
```

**Issue: Token refresh fails with 401**

```typescript
// Check:
1. CLIENT_ID is correct (9d1c250a-e61b-44d9-88ed-5944d1962f5e)
2. Refresh token is not expired
3. Credentials are stored correctly in vault

// Debug:
const token = await authManager.loadToken();
console.log('Token expiry:', new Date(token.expiresAt));
console.log('Time until expiry:', (token.expiresAt - Date.now()) / 1000, 'seconds');
```

**Issue: Stdio not inherited on Windows**

```typescript
// Add shell option for Windows:
const options = {
  stdio: 'inherit',
  shell: process.platform === 'win32',  // Enable for Windows
  ...otherOptions
};
```

**Issue: Credentials not found on platform**

```typescript
// Implement fallback chain:
// 1. Try platform-native (Credential Manager, Keychain, libsecret)
// 2. Fall back to file-based (~/.claude-wrapper/credentials)
// 3. Clear error message if all fail
```

---

## 12. Performance Tips

**Optimize startup time:**

```typescript
// Lazy-load expensive modules
import type { Logger } from './utils/logger';

// Only import when needed
async function initializeLogging() {
  const { Logger } = await import('./utils/logger');
  return new Logger();
}

// Cache frequently accessed values
private cachedToken: TokenData | null = null;
private tokenCacheTime = 0;

async loadToken(): Promise<TokenData | null> {
  const now = Date.now();
  // Refresh cache every 30 seconds
  if (this.cachedToken && (now - this.tokenCacheTime) < 30000) {
    return this.cachedToken;
  }
  // ... load from disk
}
```

**Reduce token refresh API calls:**

```typescript
// Only refresh when approaching expiry
const REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const timeUntilExpiry = token.expiresAt - Date.now();

if (timeUntilExpiry > REFRESH_THRESHOLD) {
  // Token still valid, no refresh needed
  return token.accessToken;
}
```

---

## 13. Security Checklist

- [ ] Refresh tokens stored in OS credential vault (not config files)
- [ ] Access tokens cleared from memory after use
- [ ] No tokens logged or printed to console
- [ ] File permissions set to 600 (owner only) for credential files
- [ ] Token expiry validation before every use
- [ ] HTTPS enforced for OAuth endpoint
- [ ] Input validation on all user inputs
- [ ] Error messages don't leak sensitive information
- [ ] Client secret never committed to version control
- [ ] Test suite includes security scenarios

---

## 14. Deployment Checklist

- [ ] All tests passing with 80%+ coverage
- [ ] Build succeeds without errors
- [ ] No hardcoded secrets in code
- [ ] Version bumped in package.json
- [ ] CHANGELOG updated
- [ ] README includes usage examples
- [ ] Works on Windows, macOS, Linux, WSL
- [ ] npm package metadata complete
- [ ] License file included
- [ ] Ready for `npm publish --access public`

