# Claude Wrapper - Code Patterns & Anti-Patterns

Comprehensive guide to recommended code patterns and common mistakes to avoid in the Claude Wrapper implementation.

## Table of Contents

1. [Token Management Patterns](#token-management-patterns)
2. [Process Spawning Patterns](#process-spawning-patterns)
3. [Type Safety Patterns](#type-safety-patterns)
4. [Testing Patterns](#testing-patterns)
5. [Error Handling Patterns](#error-handling-patterns)
6. [Configuration Patterns](#configuration-patterns)
7. [Common Anti-Patterns](#common-anti-patterns)
8. [Security Patterns](#security-patterns)

---

## Token Management Patterns

### Pattern 1: Proactive Refresh with Status Checking

**GOOD: Check status before every operation**

```typescript
class TokenManager {
  async getAccessToken(): Promise<string> {
    const token = await this.loadToken();

    if (!token) {
      throw new AuthError('No token available');
    }

    const status = this.getTokenStatus(token);

    switch (status) {
      case 'valid':
        return token.accessToken;

      case 'expiring-soon':
        return await this.refreshAndReturn(token);

      case 'expired':
        throw new AuthError('Token expired - re-authentication required');
    }
  }

  private async refreshAndReturn(token: TokenData): Promise<string> {
    const newToken = await this.refresher.refreshToken(
      token.refreshToken
    );
    await this.storage.saveToken(newToken);
    return newToken.accessToken;
  }

  private getTokenStatus(token: TokenData): 'valid' | 'expiring-soon' | 'expired' {
    const now = Date.now();
    const timeUntilExpiry = token.expiresAt - now;
    const thresholdMs = 5 * 60 * 1000;

    if (timeUntilExpiry < 0) return 'expired';
    if (timeUntilExpiry < thresholdMs) return 'expiring-soon';
    return 'valid';
  }
}
```

**BAD: No status checking, refresh unconditionally**

```typescript
// This wastes API calls and causes unnecessary network requests
async getAccessToken(): Promise<string> {
  const token = await this.loadToken();
  // Always refresh, even if token is fresh!
  const newToken = await this.refresher.refreshToken(token.refreshToken);
  await this.storage.saveToken(newToken);
  return newToken.accessToken;
}
```

### Pattern 2: Concurrent Refresh Deduplication

**GOOD: Prevent multiple concurrent refresh calls**

```typescript
class TokenManager {
  private refreshPromise: Promise<TokenData> | null = null;

  async ensureValidToken(): Promise<string> {
    const token = await this.loadToken();

    if (this.isTokenValid(token)) {
      return token.accessToken;
    }

    // If refresh already in progress, wait for it
    if (this.refreshPromise) {
      const refreshedToken = await this.refreshPromise;
      return refreshedToken.accessToken;
    }

    // Start refresh and store promise
    this.refreshPromise = this.performRefresh(token.refreshToken)
      .finally(() => {
        this.refreshPromise = null;
      });

    const refreshedToken = await this.refreshPromise;
    return refreshedToken.accessToken;
  }

  private async performRefresh(refreshToken: string): Promise<TokenData> {
    const newToken = await this.refresher.refreshToken(refreshToken);
    await this.storage.saveToken(newToken);
    return newToken;
  }
}
```

**BAD: Multiple concurrent refresh requests to same endpoint**

```typescript
// If two commands run simultaneously, both might refresh independently
async getToken(): Promise<string> {
  if (this.needsRefresh()) {
    // Both calls might execute this at same time!
    const token = await this.refresher.refreshToken(this.refreshToken);
    await this.storage.saveToken(token);
  }
  return this.loadToken();
}
```

### Pattern 3: Safe Token Storage with Fallbacks

**GOOD: Multiple storage strategies with fallbacks**

```typescript
interface TokenStorage {
  save(token: TokenData): Promise<void>;
  load(): Promise<TokenData | null>;
}

class HybridTokenStorage implements TokenStorage {
  constructor(
    private platforms: { primary: TokenStorage; fallback?: TokenStorage }
  ) {}

  async save(token: TokenData): Promise<void> {
    try {
      await this.platforms.primary.save(token);
    } catch (error) {
      console.warn('Primary storage failed, trying fallback:', error);

      if (this.platforms.fallback) {
        await this.platforms.fallback.save(token);
      } else {
        throw error;
      }
    }
  }

  async load(): Promise<TokenData | null> {
    try {
      const token = await this.platforms.primary.load();
      if (token) return token;
    } catch (error) {
      console.warn('Primary storage failed, trying fallback:', error);
    }

    if (this.platforms.fallback) {
      try {
        return await this.platforms.fallback.load();
      } catch (error) {
        console.warn('Fallback storage also failed:', error);
      }
    }

    return null;
  }
}

// Usage
const storage = new HybridTokenStorage({
  primary: new KeychainStorage(),
  fallback: new FileStorage()
});
```

**BAD: Single storage with no fallback**

```typescript
// If Keychain fails, entire app is broken
class TokenManager {
  async saveToken(token: TokenData): Promise<void> {
    // No error handling, no fallback
    await keytar.setPassword('claude', 'default', token.accessToken);
  }
}
```

---

## Process Spawning Patterns

### Pattern 1: Complete Stdio Inheritance

**GOOD: True transparent wrapper with stdio inheritance**

```typescript
import crossSpawn from 'cross-spawn';

class ClaudeWrapper {
  async execute(args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = crossSpawn('claude-original', args, {
        // Critical: stdio: 'inherit' makes wrapper invisible
        stdio: 'inherit',

        // Don't use shell unless necessary
        shell: false,

        // Preserve environment
        env: process.env,

        // For Windows compatibility
        ...(process.platform === 'win32' && { shell: true })
      });

      child.on('error', (error) => {
        // Handle spawn errors (missing binary, etc)
        if (error.code === 'ENOENT') {
          console.error('claude-original binary not found');
          resolve(127);
        } else {
          reject(error);
        }
      });

      // Preserve exit code
      child.on('exit', (code, signal) => {
        if (signal) {
          // Child killed by signal
          process.kill(process.pid, signal);
        }
        resolve(code ?? 0);
      });
    });
  }
}
```

**BAD: Capturing output or modifying stdio**

```typescript
// This breaks transparency - user doesn't see real output!
const child = spawn('claude-original', args, {
  stdio: 'pipe'  // Wrong! Output is buffered
});

child.stdout?.on('data', (data) => {
  console.log(data);  // Delays output, breaks interactivity
});
```

**BAD: Using shell without need**

```typescript
// Unnecessary shell adds layer of complexity
const child = spawn('claude-original', args, {
  stdio: 'inherit',
  shell: true  // Not needed for binary execution
});

// Issues:
// - Slower startup
// - Child processes not terminated on parent kill
// - Shell parsing of arguments can cause issues
```

### Pattern 2: Signal Forwarding

**GOOD: Proper signal forwarding for Ctrl+C**

```typescript
class ProcessManager {
  private activeChild: ChildProcess | null = null;

  async runWithSignalHandling(
    command: string,
    args: string[]
  ): Promise<number> {
    const child = spawn(command, args, { stdio: 'inherit' });
    this.activeChild = child;

    // Forward signals
    const forwardSignal = (signal: NodeJS.Signals) => {
      if (this.activeChild && !this.activeChild.killed) {
        this.activeChild.kill(signal);
      }
    };

    const signalsToForward: NodeJS.Signals[] = [
      'SIGINT',   // Ctrl+C
      'SIGTERM',  // Termination
      'SIGHUP'    // Hangup
    ];

    signalsToForward.forEach((signal) => {
      process.on(signal, () => forwardSignal(signal));
    });

    return new Promise((resolve) => {
      child.on('exit', (code) => {
        signalsToForward.forEach((signal) => {
          process.removeAllListeners(signal);
        });
        resolve(code ?? 0);
      });
    });
  }
}
```

**BAD: Ignoring signals**

```typescript
// Child process keeps running if parent receives Ctrl+C!
const child = spawn('claude-original', args, { stdio: 'inherit' });

child.on('exit', (code) => {
  // Ctrl+C in terminal doesn't reach child
  resolve(code);
});
```

### Pattern 3: Error Classification

**GOOD: Distinguish error types**

```typescript
class ProcessExecutor {
  async execute(args: string[]): Promise<number> {
    try {
      return await this.spawn('claude-original', args);
    } catch (error) {
      if (error instanceof ProcessNotFoundError) {
        console.error('Installation error: Claude binary not found');
        return 127;
      }

      if (error instanceof ProcessTimeoutError) {
        console.error('Timeout: Command took too long');
        return 124;
      }

      if (error instanceof ProcessSignalError) {
        console.error('Process killed by signal:', error.signal);
        return 128 + error.signalNumber;
      }

      // Unexpected error
      console.error('Unexpected error:', error);
      return 1;
    }
  }

  private async spawn(command: string, args: string[]): Promise<number> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'inherit' });

      const timeout = setTimeout(() => {
        child.kill();
        reject(new ProcessTimeoutError('Command timeout'));
      }, 30 * 60 * 1000); // 30 minutes

      child.on('error', (error) => {
        clearTimeout(timeout);

        if (error.code === 'ENOENT') {
          reject(new ProcessNotFoundError(command));
        } else {
          reject(error);
        }
      });

      child.on('exit', (code, signal) => {
        clearTimeout(timeout);

        if (signal) {
          reject(new ProcessSignalError(signal));
        } else {
          resolve(code ?? 0);
        }
      });
    });
  }
}

class ProcessNotFoundError extends Error {
  constructor(command: string) {
    super(`Process not found: ${command}`);
    this.name = 'ProcessNotFoundError';
  }
}

class ProcessTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProcessTimeoutError';
  }
}

class ProcessSignalError extends Error {
  constructor(public signal: string) {
    super(`Process killed by signal: ${signal}`);
    this.name = 'ProcessSignalError';
  }

  get signalNumber(): number {
    // SIGINT = 2, SIGTERM = 15, etc.
    const signalMap: { [key: string]: number } = {
      SIGINT: 2,
      SIGTERM: 15,
      SIGHUP: 1,
      SIGKILL: 9
    };
    return signalMap[this.signal] || 1;
  }
}
```

**BAD: Generic error handling**

```typescript
// Can't distinguish between different failure modes
try {
  const child = spawn('claude-original', args);
  // ...
} catch (error) {
  console.error('Error:', error);  // Too generic
  process.exit(1);
}
```

---

## Type Safety Patterns

### Pattern 1: Type Guards for Token Validation

**GOOD: Runtime validation with type guards**

```typescript
// Token type definitions
interface TokenData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string[];
}

// Type guard function
function isValidTokenData(data: unknown): data is TokenData {
  if (!data || typeof data !== 'object') return false;

  const token = data as Record<string, unknown>;

  return (
    typeof token.accessToken === 'string' &&
    token.accessToken.length > 0 &&
    typeof token.refreshToken === 'string' &&
    token.refreshToken.length > 0 &&
    typeof token.expiresAt === 'number' &&
    token.expiresAt > 0 &&
    Array.isArray(token.scope) &&
    token.scope.every((s) => typeof s === 'string')
  );
}

// Usage
async function loadToken(): Promise<TokenData> {
  const data = JSON.parse(await fs.readFile('./token.json', 'utf-8'));

  if (!isValidTokenData(data)) {
    throw new ValidationError('Invalid token format');
  }

  return data;
}
```

**BAD: No validation of loaded data**

```typescript
// No validation - could crash if JSON is malformed
async function loadToken(): Promise<TokenData {
  const data = JSON.parse(await fs.readFile('./token.json', 'utf-8'));
  return data as TokenData;  // Just casting, not validating
}
```

### Pattern 2: Discriminated Unions for States

**GOOD: Clear state representation**

```typescript
type TokenState =
  | { status: 'loading' }
  | { status: 'valid'; token: TokenData }
  | { status: 'expiring-soon'; token: TokenData }
  | { status: 'expired'; token: TokenData }
  | { status: 'error'; error: Error };

class TokenManager {
  private state: TokenState = { status: 'loading' };

  async ensureValid(): Promise<string> {
    switch (this.state.status) {
      case 'valid':
        return this.state.token.accessToken;

      case 'expiring-soon':
        // Refresh logic
        return await this.refreshToken(this.state.token);

      case 'expired':
      case 'error':
        throw new AuthError('Re-authentication required');

      case 'loading':
        // Wait for loading to complete
        return this.waitAndRetry();
    }
  }
}
```

**BAD: Optional properties everywhere**

```typescript
interface TokenState {
  token?: TokenData;
  error?: Error;
  isLoading?: boolean;
  isValid?: boolean;
  isExpiring?: boolean;
}

// Hard to determine actual state, unclear intent
if (state.token && !state.error && state.isValid) {
  // What if isValid is false but token exists?
  // Unclear semantics
}
```

---

## Testing Patterns

### Pattern 1: Comprehensive Mock Strategy

**GOOD: Structured mocking with clear expectations**

```typescript
class MockTokenRefresher {
  private setupMap = new Map<string, { response?: any; error?: Error }>();

  mockSuccessfulRefresh(
    refreshToken: string,
    response: Partial<OAuthTokenResponse> = {}
  ): this {
    this.setupMap.set(refreshToken, {
      response: {
        access_token: 'new-token',
        refresh_token: refreshToken,
        expires_in: 3600,
        token_type: 'Bearer',
        ...response
      }
    });
    return this;
  }

  mockFailedRefresh(refreshToken: string, error: Error): this {
    this.setupMap.set(refreshToken, { error });
    return this;
  }

  async refresh(refreshToken: string): Promise<TokenData> {
    const setup = this.setupMap.get(refreshToken);

    if (!setup) {
      throw new Error(`No mock setup for token: ${refreshToken}`);
    }

    if (setup.error) {
      throw setup.error;
    }

    return convertToTokenData(setup.response);
  }
}

// Usage in tests
describe('AuthManager', () => {
  it('should refresh on expiring token', async () => {
    const mockRefresher = new MockTokenRefresher()
      .mockSuccessfulRefresh('old-refresh', {
        access_token: 'new-access'
      });

    const manager = new AuthManager(mockRefresher);
    const token = await manager.ensureValidToken();

    expect(token).toBe('new-access');
  });
});
```

**BAD: Global jest.mock with unclear behavior**

```typescript
jest.mock('../auth/refresher');

// Unclear what TokenRefresher does - must look elsewhere
// Mock is global, affects all tests
// No type safety, easy to get wrong
```

### Pattern 2: Fixture Factories

**GOOD: Flexible fixture creation**

```typescript
class TokenFixture {
  static valid(): TokenData {
    return {
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      scope: ['claude-api'],
      tokenType: 'Bearer',
      issuedAt: Date.now(),
      clientId: 'test-client'
    };
  }

  static expired(): TokenData {
    return this.valid() as any;
    // Override expiry
    return {
      ...this.valid(),
      expiresAt: Date.now() - 3600000
    };
  }

  static expiringIn(seconds: number): TokenData {
    return {
      ...this.valid(),
      expiresAt: Date.now() + seconds * 1000
    };
  }

  static withScopes(scopes: string[]): TokenData {
    return {
      ...this.valid(),
      scope: scopes
    };
  }
}

// Usage
describe('Token Refresh', () => {
  it('should refresh expiring token', () => {
    const token = TokenFixture.expiringIn(60);
    expect(shouldRefresh(token)).toBe(true);
  });
});
```

**BAD: Hardcoded test data**

```typescript
const token = {
  accessToken: 'token123',
  refreshToken: 'refresh456',
  expiresAt: 1700000000000,
  // Expiry depends on test run date - brittle!
};
```

---

## Error Handling Patterns

### Pattern 1: Categorized Error Hierarchy

**GOOD: Specific error types with context**

```typescript
// Base error with context
abstract class WrapperError extends Error {
  abstract readonly code: string;
  abstract readonly recoverable: boolean;

  constructor(
    public readonly context: {
      operation: string;
      originalError?: Error;
    }
  ) {
    super();
  }
}

// Specific errors
class TokenExpiredError extends WrapperError {
  code = 'TOKEN_EXPIRED';
  recoverable = false;

  constructor(context: any) {
    super(context);
    this.message = 'Token has expired - re-authentication required';
  }
}

class TokenRefreshError extends WrapperError {
  code = 'TOKEN_REFRESH_FAILED';
  recoverable = true;

  constructor(
    public readonly reason: 'network' | 'auth' | 'unknown',
    context: any
  ) {
    super(context);
    this.message = `Failed to refresh token: ${reason}`;
  }
}

class BinaryNotFoundError extends WrapperError {
  code = 'BINARY_NOT_FOUND';
  recoverable = false;

  constructor(public readonly binary: string, context: any) {
    super(context);
    this.message = `Binary not found: ${binary}`;
  }
}

// Error handler
async function withErrorRecovery<T>(
  fn: () => Promise<T>,
  onError?: (error: WrapperError) => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof WrapperError) {
      if (error.recoverable && onError) {
        return await onError(error);
      }
      throw error;
    }
    // Unknown error
    throw new UnknownError({ originalError: error });
  }
}

// Usage
await withErrorRecovery(
  () => tokenManager.ensureValidToken(),
  async (error) => {
    if (error.code === 'TOKEN_REFRESH_FAILED') {
      console.warn('Token refresh failed, retrying...');
      return await retry(() => tokenManager.ensureValidToken());
    }
    throw error;
  }
);
```

**BAD: Generic errors with no context**

```typescript
// No way to distinguish different failures
try {
  await tokenManager.refreshToken();
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
```

### Pattern 2: Exponential Backoff for Retries

**GOOD: Smart retry strategy**

```typescript
interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  isRetryable: (error: Error) => boolean,
  options: RetryOptions = {
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffFactor: 2
  }
): Promise<T> {
  let lastError: Error | null = null;
  let delayMs = options.initialDelayMs;

  for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (!isRetryable(error as Error) || attempt === options.maxRetries) {
        throw error;
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Increase delay for next retry
      delayMs = Math.min(
        delayMs * options.backoffFactor,
        options.maxDelayMs
      );

      console.warn(
        `Retry attempt ${attempt + 1}/${options.maxRetries} after ${delayMs}ms:`,
        lastError.message
      );
    }
  }

  throw lastError;
}

// Usage
await retryWithBackoff(
  () => tokenManager.refreshToken(),
  (error) => {
    // Retry on network errors, not auth errors
    return error.message.includes('ECONNREFUSED') ||
           error.message.includes('timeout');
  }
);
```

**BAD: No retry or infinite loops**

```typescript
// No retry - fails immediately on transient errors
await tokenManager.refreshToken();

// Unbounded retry - can hang forever
while (true) {
  try {
    return await tokenManager.refreshToken();
  } catch (error) {
    // Retries forever without backoff
  }
}
```

---

## Configuration Patterns

### Pattern 1: Type-Safe Config Builder

**GOOD: Fluent builder with validation**

```typescript
interface WrapperConfig {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  refreshThreshold: number;
  maxRetries: number;
  timeoutMs: number;
}

class ConfigBuilder {
  private config: Partial<WrapperConfig> = {};
  private readonly defaults: WrapperConfig = {
    logLevel: 'info',
    refreshThreshold: 300000,
    maxRetries: 3,
    timeoutMs: 10000
  };

  setLogLevel(level: 'debug' | 'info' | 'warn' | 'error'): this {
    this.config.logLevel = level;
    return this;
  }

  setRefreshThreshold(ms: number): this {
    if (ms < 0) {
      throw new ValidationError('Threshold must be positive');
    }
    this.config.refreshThreshold = ms;
    return this;
  }

  build(): WrapperConfig {
    return { ...this.defaults, ...this.config };
  }

  buildAndValidate(): WrapperConfig {
    const config = this.build();

    // Validate combined config
    if (config.refreshThreshold >= config.timeoutMs) {
      throw new ValidationError(
        'refreshThreshold must be less than timeoutMs'
      );
    }

    return config;
  }
}

// Usage
const config = new ConfigBuilder()
  .setLogLevel('debug')
  .setRefreshThreshold(600000)
  .buildAndValidate();
```

**BAD: Magic numbers and env variable parsing**

```typescript
// Hard to find, understand, or change
const REFRESH_THRESHOLD = 5 * 60 * 1000;
const MAX_RETRIES = 3;

// Loose parsing, no validation
const logLevel = process.env.LOG_LEVEL || 'info';
const timeout = parseInt(process.env.TIMEOUT_MS || '10000');
```

---

## Common Anti-Patterns

### Anti-Pattern 1: Storing Tokens in Plain Config Files

**PROBLEM:**

```typescript
// NEVER do this!
interface StoredToken {
  accessToken: string;    // Exposed!
  refreshToken: string;   // Exposed!
}

// Saved to ~/.claude-wrapper/token.json with no encryption
await fs.writeFile('./token.json', JSON.stringify(token));
```

**SOLUTION:**

```typescript
// Use OS credential storage
class SecureTokenStorage {
  async save(token: TokenData, profile: string): Promise<void> {
    // Use platform-specific secure storage
    const adapter = getPlatformAdapter();

    await adapter.saveCredential(
      'claude-wrapper',
      `${profile}:access-token`,
      token.accessToken
    );

    await adapter.saveCredential(
      'claude-wrapper',
      `${profile}:refresh-token`,
      token.refreshToken
    );

    // Store metadata separately (not sensitive)
    const metadata = {
      expiresAt: token.expiresAt,
      scope: token.scope,
      clientId: token.clientId
    };

    await fs.writeFile(
      `./profiles/${profile}.json`,
      JSON.stringify(metadata),
      { mode: 0o600 }  // Owner read/write only
    );
  }
}
```

### Anti-Pattern 2: Hardcoded Secrets

**PROBLEM:**

```typescript
// NEVER commit secrets!
class OAuthClient {
  private readonly CLIENT_SECRET = 'super-secret-key'; // EXPOSED!

  async refresh(refreshToken: string): Promise<TokenData> {
    return this.http.post('/refresh', {
      client_secret: this.CLIENT_SECRET  // Sent to server
    });
  }
}
```

**SOLUTION:**

```typescript
// Load from environment or secure storage
class OAuthClient {
  private readonly clientSecret: string;

  constructor() {
    const secret = process.env.OAUTH_CLIENT_SECRET;

    if (!secret) {
      throw new ConfigError(
        'OAUTH_CLIENT_SECRET environment variable not set'
      );
    }

    this.clientSecret = secret;
  }

  async refresh(refreshToken: string): Promise<TokenData> {
    return this.http.post('/refresh', {
      client_secret: this.clientSecret
    });
  }
}
```

### Anti-Pattern 3: Logging Sensitive Information

**PROBLEM:**

```typescript
// NEVER log tokens!
async function refreshToken(token: TokenData): Promise<void> {
  console.log('Refreshing token:', token);  // EXPOSES TOKEN!
  console.log('Token:', token.accessToken);  // EXPOSES TOKEN!
  console.error('Failed:', { token, error });  // EXPOSES TOKEN!
}
```

**SOLUTION:**

```typescript
// Only log safe information
async function refreshToken(token: TokenData): Promise<void> {
  logger.debug('Refreshing token for client', {
    clientId: token.clientId,
    expiresAt: new Date(token.expiresAt).toISOString(),
    scope: token.scope
    // Do NOT include accessToken or refreshToken
  });

  // On error, only log non-sensitive details
  try {
    await this.performRefresh();
  } catch (error) {
    logger.error('Token refresh failed', {
      operation: 'refreshToken',
      errorCode: error.code,
      // Do NOT log error.message if it contains token data
    });
  }
}
```

### Anti-Pattern 4: No Timeout on HTTP Requests

**PROBLEM:**

```typescript
// Hangs forever if network is slow/down
const response = await axios.post(tokenEndpoint, payload);
```

**SOLUTION:**

```typescript
// Always set timeout
const response = await axios.post(tokenEndpoint, payload, {
  timeout: 10000  // 10 seconds
});

// Or wrap with timeout promise
const withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () => reject(new TimeoutError(`Operation timeout after ${timeoutMs}ms`)),
        timeoutMs
      )
    )
  ]);
};

// Usage
const response = await withTimeout(
  axios.post(tokenEndpoint, payload),
  10000
);
```

### Anti-Pattern 5: Blocking Event Loop

**PROBLEM:**

```typescript
// Synchronous operations block CLI interaction
const data = require('crypto').pbkdf2Sync(password, salt, iterations, length);

// Or in token validation
function validateToken(token: any): void {
  // Large computations in critical path
  for (let i = 0; i < 1000000; i++) {
    // CPU-intensive work blocks stdio
  }
}
```

**SOLUTION:**

```typescript
// Use async operations
const data = await promisify(require('crypto').pbkdf2)(
  password,
  salt,
  iterations,
  length
);

// Move expensive operations off critical path
function validateToken(token: any): void {
  // Quick synchronous checks
  if (!token.accessToken || !token.refreshToken) {
    throw new ValidationError('Invalid token structure');
  }
}

// Schedule expensive work separately
if (needsFullValidation) {
  setImmediate(async () => {
    await performExpensiveValidation(token);
  });
}
```

---

## Security Patterns

### Pattern 1: Secure Token Comparison

**GOOD: Constant-time comparison to prevent timing attacks**

```typescript
function isValidRefreshToken(
  provided: string,
  stored: string
): boolean {
  // Use crypto.timingSafeEqual to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(provided),
      Buffer.from(stored)
    );
  } catch {
    // timingSafeEqual throws if lengths differ
    return false;
  }
}

// Usage in token refresh
async function refreshToken(refreshToken: string): Promise<TokenData> {
  const storedToken = await this.loadStoredRefreshToken();

  if (!isValidRefreshToken(refreshToken, storedToken)) {
    throw new AuthError('Invalid refresh token');
  }

  return this.performRefresh(refreshToken);
}
```

**BAD: Simple string comparison**

```typescript
// Vulnerable to timing attacks
if (refreshToken === storedToken) {
  // Takes different times to compare valid vs invalid tokens
  // Attacker can use timing to guess token
}
```

### Pattern 2: Input Validation and Sanitization

**GOOD: Strict input validation**

```typescript
interface ValidatedInput {
  readonly args: readonly string[];
  readonly env: Readonly<NodeJS.ProcessEnv>;
}

function validateCLIInput(args: string[]): ValidatedInput {
  // Validate each argument
  const validatedArgs = args.map((arg) => {
    // Check length
    if (arg.length > 10000) {
      throw new ValidationError('Argument too long');
    }

    // Reject null bytes
    if (arg.includes('\0')) {
      throw new ValidationError('Null bytes not allowed');
    }

    // No command injection attempts
    if (/[;&|`$()]/.test(arg)) {
      // This is legitimate for some commands, but validate carefully
      console.warn(`Argument contains shell characters: ${arg}`);
    }

    return arg;
  });

  // Validate environment
  const validatedEnv = { ...process.env };

  // Remove sensitive env vars from child process
  delete validatedEnv.OAUTH_CLIENT_SECRET;
  delete validatedEnv.CLAUDE_AUTH_TOKEN_DEBUG;

  return {
    args: validatedArgs as readonly string[],
    env: validatedEnv
  };
}

// Usage
const { args, env } = validateCLIInput(userArgs);
const child = spawn('claude-original', args, { env, stdio: 'inherit' });
```

**BAD: No validation**

```typescript
// Passes untrusted input directly
spawn('claude-original', process.argv.slice(2), {
  env: process.env,  // Includes all secrets!
  stdio: 'inherit',
  shell: true  // Command injection possible!
});
```

### Pattern 3: Secure File Permissions

**GOOD: Restrictive permissions on credential files**

```typescript
import { writeFileSync, chmodSync } from 'fs';

class FileCredentialStorage {
  async save(path: string, data: string): Promise<void> {
    // Write with secure permissions immediately
    writeFileSync(path, data, {
      mode: 0o600,  // Owner read/write only (rw-------)
      flag: 'w'
    });

    // Verify permissions were set
    const stats = fs.statSync(path);
    const permissions = (stats.mode & parseInt('777', 8)).toString(8);

    if (permissions !== '600') {
      throw new SecurityError(
        `File permissions insecure: ${permissions} (expected 600)`
      );
    }
  }

  async load(path: string): Promise<string> {
    // Verify permissions before reading
    const stats = fs.statSync(path);
    const permissions = (stats.mode & parseInt('777', 8)).toString(8);

    if (permissions !== '600') {
      throw new SecurityError(
        `File permissions insecure: ${permissions} (expected 600)`
      );
    }

    return fs.readFileSync(path, 'utf-8');
  }
}
```

**BAD: No permission control**

```typescript
// File readable by other users!
fs.writeFileSync(credentialPath, JSON.stringify(token));

// Or uses default permissions
fs.writeFile(credentialPath, JSON.stringify(token), (err) => {
  // Permissions depend on umask - unpredictable
});
```

