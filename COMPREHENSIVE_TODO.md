# Comprehensive TODO & Implementation Plan

**Generated:** 2025-11-14
**Project:** cc-profile-hub
**Current Progress:** 52% Complete (GH-04 60% done)
**Test Coverage:** 97.73% statements, 88.4% branches
**Priority:** Production-Ready Implementation

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Critical Issues (MUST FIX FIRST)](#critical-issues-must-fix-first)
3. [Complete GH-04 Token Refresher](#complete-gh-04-token-refresher)
4. [Core Features - Parallel Track](#core-features---parallel-track)
5. [Authentication Layer - Sequential](#authentication-layer---sequential)
6. [Production Hardening](#production-hardening)
7. [Integration & E2E Testing](#integration--e2e-testing)
8. [Documentation & Polish](#documentation--polish)
9. [Implementation Order & Timeline](#implementation-order--timeline)
10. [Evidence & Source Analysis](#evidence--source-analysis)

---

## Executive Summary

### Current State

**Completed:**
- ✅ GH-00: Tooling Bootstrap (100%)
- ✅ GH-01: Process Interceptor (100%)
- ✅ GH-02: Config + Logging (100%)
- ✅ GH-03: Token Store + Crypto (100%)
- 🔶 GH-04: Token Refresher (60%)

**Remaining:**
- ⏳ GH-05: Auth Manager (Blocked by GH-04)
- ⏳ GH-06: Profile Manager (Ready)
- ⏳ GH-07: Platform Adapters (Ready)
- ⏳ GH-08: Integration/E2E (Blocked by all)

### Quality Metrics

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| Statement Coverage | 97.73% | 90% | ✅ |
| Branch Coverage | **88.4%** | 90% | ❌ |
| Function Coverage | 94.2% | 90% | ✅ |
| Line Coverage | 97.66% | 90% | ✅ |

### Critical Path

```
1. Fix Branch Coverage (2-3h)
   ↓
2. Fix Security Issue (1h)
   ↓
3. Complete GH-04 (2-3h)
   ↓
4. [PARALLEL] GH-06 + GH-07 (2 weeks)
   ↓
5. [SEQUENTIAL] GH-05 (1 week)
   ↓
6. GH-08 Integration (1 week)
   ↓
7. Production Hardening (1 week)
```

**Timeline:** 5-7 weeks to production-ready

---

## Critical Issues (MUST FIX FIRST)

### Priority 1: Branch Coverage Below Threshold

**Status:** ❌ CRITICAL
**Current:** 88.4% (Target: 90%)
**Estimated Time:** 2-3 hours

#### Issue 1.1: TokenRefresher Branch Coverage (70%)

**File:** `src/auth/TokenRefresher.ts`
**Lines:** 27, 50, 60

**Evidence:**
```typescript
// Line 27 - client_secret branch not tested
{
  grant_type: 'refresh_token',
  refresh_token: refreshToken,
  client_id: this.config.clientId,
  ...(this.config.clientSecret && { client_secret: this.config.clientSecret }), // ← Uncovered
}

// Line 50 - error.response?.data?.error fallback not tested
throw new Error(`Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`);
//                                                                    ^^^^^^^^^^^^^^^^ Uncovered

// Line 60-61 - applyJitter false path not tested
if (this.retryPolicy.applyJitter) {  // ← Only true path tested
  delayMs = applyJitter(delayMs);
}
```

**Fix:**
```typescript
// Add to tests/auth/TokenRefresher.test.ts

it('should include client_secret when provided', async () => {
  const httpClient = axios.create();
  const mockHttp = new MockAdapter(httpClient);

  const refresherWithSecret = new TokenRefresher({
    httpClient,
    tokenUrl: 'https://api.anthropic.com/oauth/token',
    clientId: 'test-client',
    clientSecret: 'test-secret',  // ← Test this path
  });

  mockHttp.onPost().reply((config) => {
    const data = JSON.parse(config.data);
    expect(data.client_secret).toBe('test-secret');
    return [200, {
      access_token: 'test',
      refresh_token: 'test',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    }];
  });

  await refresherWithSecret.refresh('test-refresh', ['user:inference']);
});

it('should handle 401 error without error field', async () => {
  mockHttp.onPost().reply(401, {}); // No error field

  await expect(
    refresher.refresh('test-refresh', ['user:inference'])
  ).rejects.toThrow(/invalid_grant/);  // Tests fallback
});

it('should skip jitter when disabled', async () => {
  const noJitterRefresher = new TokenRefresher(
    { httpClient: axios.create(), tokenUrl: 'test', clientId: 'test' },
    { applyJitter: false, getDelayMs: () => 100 }  // ← Test false path
  );

  const mockHttp = new MockAdapter(noJitterRefresher['config'].httpClient);

  let delays: number[] = [];
  const originalSleep = require('../../src/auth/retryPolicy').sleep;
  jest.spyOn(require('../../src/auth/retryPolicy'), 'sleep')
    .mockImplementation((ms: number) => {
      delays.push(ms);
      return Promise.resolve();
    });

  mockHttp.onPost().reply(429);

  await expect(
    noJitterRefresher.refresh('test', ['user:inference'])
  ).rejects.toThrow();

  // Verify delays are exact (no jitter)
  expect(delays).toEqual([100, 100, 100]);
});
```

**Acceptance Criteria:**
- [ ] TokenRefresher branch coverage ≥ 90%
- [ ] All 3 new tests passing
- [ ] Coverage report shows lines 27, 50, 60 covered

---

#### Issue 1.2: ConfigLoader Error Path (75%)

**File:** `src/config/ConfigLoader.ts`
**Line:** 18

**Evidence:**
```typescript
// Line 14-19 - Generic error rethrow not tested
try {
  const content = await readFile(this.configPath, 'utf-8');
  return content;
} catch (error: unknown) {
  if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
    throw new Error(`Config file not found: ${this.configPath}`);
  }
  throw error;  // ← This branch uncovered (e.g., EACCES, EISDIR)
}
```

**Fix:**
```typescript
// Add to tests/config/ConfigLoader.test.ts

it('should handle permission denied errors', async () => {
  const configPath = join(tempDir, 'no-access.yml');

  // Create file then remove read permission
  writeFileSync(configPath, 'claudePath: /bin/claude');
  chmodSync(configPath, 0o000);  // No permissions

  const loader = new ConfigLoader(configPath);

  try {
    await expect(loader.load()).rejects.toThrow();
    // Should throw original error, not "not found"
  } finally {
    chmodSync(configPath, 0o644);  // Restore for cleanup
  }
});

it('should handle directory instead of file', async () => {
  const dirPath = join(tempDir, 'is-a-directory');
  mkdirSync(dirPath);

  const loader = new ConfigLoader(dirPath);

  await expect(loader.load()).rejects.toThrow();
  // Should throw EISDIR error, not "not found"
});
```

**Acceptance Criteria:**
- [ ] ConfigLoader branch coverage ≥ 90%
- [ ] Both error scenario tests passing
- [ ] Line 18 covered in coverage report

---

#### Issue 1.3: ClaudeWrapper Process Errors (88.88%)

**File:** `src/wrapper/ClaudeWrapper.ts`
**Lines:** 67-68

**Evidence:**
```typescript
// Line 67-68 - Process error event not tested
child.on('error', (error) => {
  this.emit('error', error);  // ← Uncovered
  resolve(1);                 // ← Uncovered
});
```

**Fix:**
```typescript
// Add to tests/unit/wrapper/wrapper.test.ts

it('should handle spawn errors (ENOENT)', async () => {
  const wrapper = new ClaudeWrapper({
    claudePath: '/nonexistent/binary',  // Invalid path
    args: ['--version'],
  });

  const errorPromise = new Promise<Error>((resolve) => {
    wrapper.on('error', resolve);
  });

  const exitCode = await wrapper.run();

  expect(exitCode).toBe(1);

  const error = await errorPromise;
  expect(error.message).toMatch(/ENOENT|spawn.*failed/i);
});

it('should handle spawn permission errors', async () => {
  // Create a file without execute permission
  const binPath = join(tmpdir(), 'no-exec-binary');
  writeFileSync(binPath, '#!/bin/bash\necho "test"');
  chmodSync(binPath, 0o644);  // Read/write only, no execute

  const wrapper = new ClaudeWrapper({
    claudePath: binPath,
    args: ['--version'],
  });

  const errorEmitted = new Promise<boolean>((resolve) => {
    wrapper.on('error', () => resolve(true));
  });

  await wrapper.run();
  expect(await errorEmitted).toBe(true);
});
```

**Acceptance Criteria:**
- [ ] ClaudeWrapper branch coverage ≥ 90%
- [ ] Both spawn error tests passing
- [ ] Lines 67-68 covered

---

### Priority 2: Security - File Permissions

**Status:** 🔴 CRITICAL SECURITY ISSUE
**Risk:** High (Tokens readable by other users)
**Estimated Time:** 1 hour

**Evidence:**
```typescript
// src/auth/TokenStore.ts:29-30 - No file permissions set!
const tempPath = `${filePath}.tmp`;
await writeFile(tempPath, content, 'utf-8');  // ← Defaults to 0o666 (world-readable!)
await rename(tempPath, filePath);

// VULNERABLE: Other users on system can read token files:
// $ ls -la ~/.claude-wrapper/tokens/
// -rw-rw-rw- 1 user user 1234 Nov 14 10:00 work.enc.json  ← World-readable!
```

**Impact:**
- Tokens contain OAuth credentials
- Any user on the system can steal tokens
- Allows impersonation attacks
- Violates security best practices

**Fix:**
```typescript
// src/auth/TokenStore.ts - UPDATE write method

async write(profileId: string, tokenData: TokenData): Promise<void> {
  const filePath = this.getTokenPath(profileId);
  const content = JSON.stringify(tokenData, null, 2);

  // Ensure directory exists with secure permissions
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true, mode: 0o700 });  // ← Owner only

  const tempPath = `${filePath}.tmp`;

  // Write with secure permissions
  await writeFile(tempPath, content, {
    encoding: 'utf-8',
    mode: 0o600  // ← Owner read/write only
  });

  await rename(tempPath, filePath);

  // Verify permissions after write (defense in depth)
  const stats = await stat(filePath);
  const perms = stats.mode & 0o777;
  if (perms !== 0o600) {
    // Attempt to fix
    await chmod(filePath, 0o600);
    throw new SecurityError(
      `Token file had insecure permissions: ${perms.toString(8)}. ` +
      `Permissions corrected to 0600. Please check system umask settings.`
    );
  }
}
```

**Test:**
```typescript
// Add to tests/auth/TokenStore.test.ts

describe('Token File Security', () => {
  it('should create token files with mode 0600', async () => {
    const tokenData = {
      accessToken: 'test-token',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer' as const,
      deviceFingerprint: 'test',
    };

    await store.write('test-profile', tokenData);

    const filePath = join(tempDir, 'test-profile.json');
    const stats = await stat(filePath);
    const mode = stats.mode & 0o777;

    expect(mode).toBe(0o600);  // Owner read/write only
  });

  it('should create token directory with mode 0700', async () => {
    const tokenData = { /* ... */ };

    await store.write('test-profile', tokenData);

    const stats = await stat(tempDir);
    const mode = stats.mode & 0o777;

    expect(mode).toBe(0o700);  // Owner all, others none
  });

  it('should throw SecurityError if permissions are wrong', async () => {
    const tokenData = { /* ... */ };
    const filePath = join(tempDir, 'test-profile.json');

    // Pre-create file with wrong permissions
    writeFileSync(filePath, '{}', { mode: 0o644 });

    // Mock fs.stat to return wrong permissions
    const originalStat = fs.promises.stat;
    jest.spyOn(fs.promises, 'stat').mockResolvedValueOnce({
      mode: 0o100644,  // Wrong permissions
      // ... other stats
    } as Stats);

    await expect(
      store.write('test-profile', tokenData)
    ).rejects.toThrow(SecurityError);

    fs.promises.stat = originalStat;
  });
});
```

**Also Fix:** `src/auth/EncryptedTokenStore.ts` (same issue)

**Acceptance Criteria:**
- [ ] Token files created with mode 0600
- [ ] Token directory created with mode 0700
- [ ] Permission verification after write
- [ ] SecurityError thrown if permissions wrong
- [ ] Tests passing for both TokenStore and EncryptedTokenStore
- [ ] Works on all platforms (Unix, macOS, Windows via chmod polyfill)

---

## Complete GH-04 Token Refresher

**Status:** 60% Complete
**Remaining:** Commits 7-10
**Estimated Time:** 2-3 hours

### Task 4.1: Implement MetricsCollector

**File to Create:** `src/telemetry/MetricsCollector.ts`

**Requirements:**
- Record latency metrics (token_refresh_latency_ms)
- Increment counters (token_refresh_failures_total)
- Record retry counts (token_refresh_retries)
- Tag metrics (status_code, error_type)
- Thread-safe for concurrent operations

**Implementation:**
```typescript
// src/telemetry/MetricsCollector.ts

export interface MetricTags {
  [key: string]: string | number | boolean;
}

export class MetricsCollector {
  private metrics = new Map<string, number>();
  private counters = new Map<string, number>();
  private histograms = new Map<string, number[]>();
  private lastTags: MetricTags = {};

  /**
   * Record a metric value with optional tags
   */
  recordMetric(name: string, value: number, tags?: MetricTags): void {
    this.metrics.set(name, value);
    if (tags) {
      this.lastTags = { ...this.lastTags, ...tags };
    }
  }

  /**
   * Increment a counter
   */
  incrementCounter(name: string, tags?: MetricTags): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
    if (tags) {
      this.lastTags = { ...this.lastTags, ...tags };
    }
  }

  /**
   * Record a value in a histogram (for percentile calculations)
   */
  recordHistogram(name: string, value: number): void {
    const values = this.histograms.get(name) || [];
    values.push(value);
    this.histograms.set(name, values);
  }

  /**
   * Get the latest value of a metric
   */
  getMetric(name: string): number | undefined {
    return this.metrics.get(name);
  }

  /**
   * Get the current value of a counter
   */
  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  /**
   * Get histogram values
   */
  getHistogram(name: string): number[] {
    return this.histograms.get(name) || [];
  }

  /**
   * Get the most recently recorded tags
   */
  getLastTags(): MetricTags {
    return { ...this.lastTags };
  }

  /**
   * Calculate percentile from histogram
   */
  getPercentile(name: string, percentile: number): number | undefined {
    const values = this.histograms.get(name);
    if (!values || values.length === 0) return undefined;

    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[index];
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.histograms.clear();
    this.lastTags = {};
  }

  /**
   * Get all metrics as JSON (for export)
   */
  toJSON(): object {
    return {
      metrics: Object.fromEntries(this.metrics),
      counters: Object.fromEntries(this.counters),
      histograms: Object.fromEntries(this.histograms),
      tags: this.lastTags,
    };
  }
}
```

**Tests:** See `tests/telemetry/MetricsCollector.test.ts` from GH-04 spec

**Acceptance Criteria:**
- [ ] MetricsCollector class implemented
- [ ] All methods tested
- [ ] Thread-safe for async operations
- [ ] 95%+ test coverage

---

### Task 4.2: Integrate Metrics into TokenRefresher

**File to Update:** `src/auth/TokenRefresher.ts`

**Changes:**
```typescript
// Update constructor
constructor(
  private config: RefreshConfig,
  retryPolicy?: Partial<RetryPolicy>,
  private metrics?: MetricsCollector  // ← Add optional metrics
) {
  this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
}

// Update refresh method
async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
  const startTime = Date.now();  // ← Track start time
  let attempt = 0;
  let lastError: any;

  while (attempt < this.retryPolicy.maxAttempts) {
    attempt++;

    try {
      const response = await this.config.httpClient.post<OAuthTokenResponse>(
        // ... request ...
      );

      const data = response.data;
      const now = Date.now();

      // ✅ Record success metrics
      if (this.metrics) {
        this.metrics.recordMetric('token_refresh_latency_ms', now - startTime);
        this.metrics.recordHistogram('token_refresh_latency_ms', now - startTime);

        if (attempt > 1) {
          this.metrics.recordMetric('token_refresh_retries', attempt - 1);
        }
      }

      return {
        accessToken: data.access_token,
        // ... rest of token data ...
      };
    } catch (error: any) {
      lastError = error;
      const statusCode = error.response?.status;
      const errorType = error.response?.data?.error || 'unknown';

      // Don't retry on 401
      if (statusCode === 401) {
        // ✅ Record failure metrics
        if (this.metrics) {
          this.metrics.incrementCounter('token_refresh_failures_total', {
            status_code: 401,
            error_type: 'invalid_grant',
          });
        }
        throw new Error(`Token refresh failed: ${errorType}`);
      }

      // Check if we should retry
      if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
        // ✅ Record non-retryable failure
        if (this.metrics) {
          this.metrics.incrementCounter('token_refresh_failures_total', {
            status_code: statusCode || 0,
            error_type: errorType,
          });
        }
        break;
      }

      // Apply jitter and retry...
    }
  }

  // ✅ Record max retries exceeded
  if (this.metrics) {
    this.metrics.incrementCounter('token_refresh_failures_total', {
      error_type: 'max_retries_exceeded',
      attempts: attempt,
    });
  }

  throw new Error(`Token refresh failed after ${attempt} attempts`);
}
```

**Tests:** See GH-04 spec commit 7-8 tests

**Acceptance Criteria:**
- [ ] Metrics recorded on success
- [ ] Metrics recorded on failure
- [ ] Metrics recorded on retry
- [ ] All metrics tests passing
- [ ] TokenRefresher coverage ≥ 95%

---

### Task 4.3: Refresh Token Rotation Tests

**File to Update:** `tests/auth/TokenRefresher.test.ts`

**Tests to Add:**
```typescript
describe('Refresh Token Rotation', () => {
  it('should handle refresh token rotation', async () => {
    const oldRefreshToken = 'old-refresh-token';

    mockHttp.onPost().reply(200, {
      access_token: 'new-access',
      refresh_token: 'rotated-refresh-token',  // ← New token
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    const result = await refresher.refresh(oldRefreshToken, ['user:inference']);

    expect(result.refreshToken).toBe('rotated-refresh-token');
    expect(result.refreshToken).not.toBe(oldRefreshToken);
  });

  it('should preserve refresh token if not rotated', async () => {
    const originalRefresh = 'static-refresh-token';

    mockHttp.onPost().reply(200, {
      access_token: 'new-access',
      refresh_token: originalRefresh,  // ← Same token
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference',
    });

    const result = await refresher.refresh(originalRefresh, ['user:inference']);

    expect(result.refreshToken).toBe(originalRefresh);
  });
});
```

**Acceptance Criteria:**
- [ ] Rotation tests passing
- [ ] Documentation updated with rotation notes
- [ ] TokenRefresher handles both rotation modes

---

## Core Features - Parallel Track

**These can be developed in parallel by multiple developers**

### GH-06: Profile Manager

**Status:** Ready (dependencies met)
**Estimated Time:** 10-12 hours
**Priority:** High

**Dependencies:** GH-02 (Config) ✅, GH-03 (Token Store) ✅

**Files to Create:**
```
src/profiles/
├── ProfileManager.ts       # Main manager class
├── types.ts                # ProfileRecord, WrapperState
└── AuditLogger.ts          # Audit trail with rotation

tests/profiles/
├── ProfileManager.test.ts
└── AuditLogger.test.ts
```

**Key Features:**
1. CRUD operations (create, read, update, delete profiles)
2. Atomic profile switching with rollback
3. Audit logging with rotation (max 10MB, keep 3 files)
4. Profile validation
5. Active profile tracking

**Evidence from Spec:**
```typescript
// From .github/issues/GH-06-profile-manager.md

export interface ProfileRecord {
  id: string;
  name: string;
  oauth: {
    clientId: string;
    tokenUrl: string;
  };
  createdAt: number;
  lastUsedAt: number;
}

export interface WrapperState {
  activeProfile: string | null;
  profiles: Map<string, ProfileRecord>;
}
```

**Critical Implementation Notes:**
- Must use atomic operations (write temp → rename)
- Profile IDs are slugified names (lowercase, hyphens)
- Audit log format: `timestamp | action | profileId | details`
- Default profile: "default"

**Acceptance Criteria:**
- [ ] ProfileManager class with CRUD methods
- [ ] Atomic profile switching (no partial state)
- [ ] Audit logging with size-based rotation
- [ ] All CRUD operations tested
- [ ] Error handling for duplicate profiles
- [ ] Coverage ≥ 95%

---

### GH-07: Platform Adapters

**Status:** Ready (dependencies met)
**Estimated Time:** 10-12 hours
**Priority:** High

**Dependencies:** GH-00 (Bootstrap) ✅

**Files to Create:**
```
src/platform/
├── PlatformDetector.ts      # Detects OS and WSL
├── PlatformAdapter.ts       # Abstract base class
├── WindowsAdapter.ts        # Windows credential manager
├── MacOSAdapter.ts          # macOS Keychain
├── LinuxAdapter.ts          # Secret Service API
└── types.ts                 # Platform enums

tests/platform/
├── PlatformDetector.test.ts
├── WindowsAdapter.test.ts
├── MacOSAdapter.test.ts
└── LinuxAdapter.test.ts
```

**Key Features:**
1. Auto-detect platform (Windows, macOS, Linux, WSL)
2. OS-specific secure storage (Keychain, Credential Manager, Secret Service)
3. Fallback to encrypted file storage
4. WSL path translation (`/mnt/c/...` ↔ `C:\...`)

**Platform Detection Logic:**
```typescript
// src/platform/PlatformDetector.ts

export enum Platform {
  Windows = 'win32',
  MacOS = 'darwin',
  Linux = 'linux',
  WSL = 'wsl',
}

export class PlatformDetector {
  static detect(): Platform {
    const platform = process.platform;

    // Check for WSL
    if (platform === 'linux') {
      try {
        const release = fs.readFileSync('/proc/version', 'utf-8');
        if (release.toLowerCase().includes('microsoft')) {
          return Platform.WSL;
        }
      } catch {
        // Not WSL or can't read /proc/version
      }
    }

    return platform as Platform;
  }

  static isWSL(): boolean {
    return this.detect() === Platform.WSL;
  }

  static getAdapter(): PlatformAdapter {
    const platform = this.detect();

    switch (platform) {
      case Platform.Windows:
        return new WindowsAdapter();
      case Platform.MacOS:
        return new MacOSAdapter();
      case Platform.Linux:
      case Platform.WSL:
        return new LinuxAdapter();
    }
  }
}
```

**WSL Path Translation:**
```typescript
// Windows → WSL: C:\Users\foo → /mnt/c/Users/foo
// WSL → Windows: /mnt/c/Users/foo → C:\Users\foo

export class WSLPathTranslator {
  static toWSL(windowsPath: string): string {
    // C:\Users\foo → /mnt/c/Users/foo
    const match = windowsPath.match(/^([A-Z]):\\/);
    if (!match) return windowsPath;

    const drive = match[1].toLowerCase();
    const rest = windowsPath.substring(3).replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
  }

  static toWindows(wslPath: string): string {
    // /mnt/c/Users/foo → C:\Users\foo
    const match = wslPath.match(/^\/mnt\/([a-z])\/(.*)/);
    if (!match) return wslPath;

    const drive = match[1].toUpperCase();
    const rest = match[2].replace(/\//g, '\\');
    return `${drive}:\\${rest}`;
  }
}
```

**Acceptance Criteria:**
- [ ] Platform detection working on all OSes
- [ ] WSL detection accurate
- [ ] Path translation bidirectional
- [ ] Secure storage adapters implemented
- [ ] Graceful fallback to file storage
- [ ] Cross-platform tests passing
- [ ] Coverage ≥ 90%

---

## Authentication Layer - Sequential

**Must be completed after GH-04**

### GH-05: Auth Manager + Scheduler

**Status:** Blocked by GH-04
**Estimated Time:** 8-10 hours
**Priority:** High

**Dependencies:** GH-01 (Process) ✅, GH-04 (Token Refresher) ⏳

**Files to Create:**
```
src/auth/
├── AuthManager.ts           # Main auth coordinator
├── Mutex.ts                 # Concurrency control
└── types.ts                 # Auth types (update)

tests/auth/
├── AuthManager.test.ts
└── Mutex.test.ts
```

**Key Features:**
1. `ensureValidToken()` - central token validation
2. Background refresh scheduler (check every 60s)
3. Mutex protection (prevent duplicate refreshes)
4. Request deduplication (concurrent callers wait for same refresh)
5. Configurable refresh threshold (default 300s before expiry)

**Critical Implementation:**
```typescript
// src/auth/Mutex.ts

export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    } else {
      this.locked = false;
    }
  }

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}
```

**Request Deduplication:**
```typescript
// src/auth/AuthManager.ts

export class AuthManager {
  private refreshMutex = new Mutex();
  private pendingRefresh: Promise<TokenData> | null = null;

  async ensureValidToken(): Promise<TokenData> {
    // Fast path: token still valid
    const existing = await this.store.read(this.profileId);
    if (existing && !isTokenExpired(existing, this.config.refreshThreshold)) {
      return existing;
    }

    // Slow path: need refresh
    return this.refreshMutex.runExclusive(async () => {
      // Check again inside mutex (may have been refreshed)
      const current = await this.store.read(this.profileId);
      if (current && !isTokenExpired(current, this.config.refreshThreshold)) {
        return current;
      }

      // Actually refresh
      if (!current) {
        throw new TokenError('No refresh token available');
      }

      const newToken = await this.refresher.refresh(
        current.refreshToken,
        current.scopes
      );

      await this.store.write(this.profileId, newToken);
      return newToken;
    });
  }

  startBackgroundRefresh(): void {
    this.refreshInterval = setInterval(async () => {
      try {
        await this.ensureValidToken();
      } catch (error) {
        this.logger.error('Background refresh failed', { error });
      }
    }, 60 * 1000);  // Every 60 seconds
  }

  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Mutex prevents concurrent refreshes
- [ ] Background scheduler working
- [ ] Request deduplication tested
- [ ] ensureValidToken() handles all edge cases
- [ ] Proper cleanup on shutdown
- [ ] Coverage ≥ 95%

---

## Production Hardening

**After core features complete**

### Task H.1: Custom Error Hierarchy

**Files to Create:** `src/errors/`

```typescript
// src/errors/BaseError.ts
export class BaseError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack,
    };
  }
}

// src/errors/ConfigError.ts
export class ConfigError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'CONFIG_ERROR', context);
  }
}

// src/errors/TokenError.ts
export class TokenError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'TOKEN_ERROR', context);
  }
}

// src/errors/AuthError.ts
export class AuthError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'AUTH_ERROR', context);
  }
}

// src/errors/SecurityError.ts
export class SecurityError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'SECURITY_ERROR', context);
  }
}

// src/errors/ProcessError.ts
export class ProcessError extends BaseError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PROCESS_ERROR', context);
  }
}

// src/errors/index.ts
export * from './BaseError';
export * from './ConfigError';
export * from './TokenError';
export * from './AuthError';
export * from './SecurityError';
export * from './ProcessError';
```

**Usage:**
```typescript
// Replace generic errors with specific ones
throw new ConfigError(
  'Config file not found',
  { path: this.configPath, cwd: process.cwd() }
);

throw new TokenError(
  'Refresh token expired',
  { profileId, expiresAt: token.expiresAt }
);

throw new SecurityError(
  'Insecure file permissions detected',
  { path: filePath, mode: perms.toString(8) }
);
```

**Benefits:**
- Type-safe error handling
- Structured error context
- Error codes for programmatic handling
- Better debugging with context
- JSON serialization for logging

---

### Task H.2: Circuit Breaker for OAuth

**File:** `src/auth/CircuitBreaker.ts`

```typescript
export enum CircuitState {
  CLOSED = 'closed',      // Normal operation
  OPEN = 'open',          // Too many failures, reject immediately
  HALF_OPEN = 'half_open' // Testing if service recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;    // Open after N failures (default: 5)
  recoveryTimeout: number;     // Try again after N ms (default: 60000)
  successThreshold: number;    // Close after N successes in half-open (default: 2)
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptTime = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttemptTime) {
        throw new AuthError('Circuit breaker is OPEN', {
          state: this.state,
          nextAttemptIn: this.nextAttemptTime - Date.now(),
        });
      }
      // Transition to half-open
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (this.failureCount >= this.options.failureThreshold) {
      this.state = CircuitState.OPEN;
      this.nextAttemptTime = Date.now() + this.options.recoveryTimeout;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptTime = 0;
  }
}
```

**Integration:**
```typescript
// src/auth/TokenRefresher.ts

export class TokenRefresher {
  private circuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    recoveryTimeout: 60000,
    successThreshold: 2,
  });

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
    return this.circuitBreaker.execute(async () => {
      // Existing refresh logic...
    });
  }
}
```

---

### Task H.3: Enhanced Configuration

**Update:** `src/config/types.ts`

```typescript
export const ConfigSchema = z.object({
  claudePath: z.string().min(1),

  oauth: z.object({
    tokenUrl: z.string().url(),
    clientId: z.string().min(1),
    scopes: z.array(z.string()).optional().default(['user:inference']),
  }),

  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    redactTokens: z.boolean().default(true),
    file: z.string().optional(),  // Log to file
  }).optional().default(() => ({ level: 'info', redactTokens: true })),

  refreshThreshold: z.number().min(60).default(300),

  // NEW: Retry policy configuration
  retryPolicy: z.object({
    maxAttempts: z.number().min(1).max(10).default(4),
    initialDelayMs: z.number().min(100).default(1000),
    maxDelayMs: z.number().min(1000).default(8000),
    backoffFactor: z.number().min(1).default(2),
    applyJitter: z.boolean().default(true),
  }).optional().default(() => ({
    maxAttempts: 4,
    initialDelayMs: 1000,
    maxDelayMs: 8000,
    backoffFactor: 2,
    applyJitter: true,
  })),

  // NEW: Timeout configurations
  timeouts: z.object({
    tokenRefresh: z.number().min(1000).default(10000),
    processSpawn: z.number().min(60000).default(1800000),  // 30 min
  }).optional().default(() => ({
    tokenRefresh: 10000,
    processSpawn: 1800000,
  })),

  // NEW: Storage configuration
  storage: z.object({
    encryption: z.boolean().default(true),
    tokenPath: z.string().optional(),
  }).optional().default(() => ({
    encryption: true,
  })),

  // NEW: Circuit breaker
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    failureThreshold: z.number().min(1).default(5),
    recoveryTimeout: z.number().min(1000).default(60000),
    successThreshold: z.number().min(1).default(2),
  }).optional().default(() => ({
    enabled: true,
    failureThreshold: 5,
    recoveryTimeout: 60000,
    successThreshold: 2,
  })),
});
```

---

## Integration & E2E Testing

### GH-08: Integration Test Harness

**Status:** Blocked by all features
**Estimated Time:** 12-14 hours
**Priority:** Medium

**Files to Create:**
```
tests/integration/
├── IntegrationHarness.ts
├── fixtures/
│   ├── claude-mock-binary.ts
│   └── test-configs/
└── scenarios/
    ├── multi-profile.test.ts
    ├── background-refresh.test.ts
    └── platform-adapters.test.ts

tests/e2e/
├── full-workflow.test.ts
└── cross-platform.test.ts
```

**Mock Claude Binary:**
```typescript
// tests/integration/fixtures/claude-mock-binary.ts

#!/usr/bin/env node

// Simple mock that echoes stdin and responds to --version
const args = process.argv.slice(2);

if (args.includes('--version')) {
  console.log('Claude CLI v1.0.0 (mock)');
  process.exit(0);
}

// Echo stdin for testing wrapper passthrough
process.stdin.pipe(process.stdout);

// Exit after 100ms
setTimeout(() => process.exit(0), 100);
```

**Integration Test Example:**
```typescript
// tests/integration/scenarios/multi-profile.test.ts

describe('Multi-Profile Workflow', () => {
  let tempDir: string;
  let profileManager: ProfileManager;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'profile-test-'));
    profileManager = new ProfileManager({
      profilesPath: join(tempDir, 'profiles.json'),
    });
  });

  it('should switch between profiles atomically', async () => {
    // Create two profiles
    await profileManager.create({
      name: 'work',
      oauth: {
        clientId: 'work-client',
        tokenUrl: 'https://work.example.com/token',
      },
    });

    await profileManager.create({
      name: 'personal',
      oauth: {
        clientId: 'personal-client',
        tokenUrl: 'https://personal.example.com/token',
      },
    });

    // Switch to work
    await profileManager.switchTo('work');
    expect(await profileManager.getActive()).toBe('work');

    // Switch to personal
    await profileManager.switchTo('personal');
    expect(await profileManager.getActive()).toBe('personal');

    // Verify audit trail
    const auditLog = await profileManager.getAuditLog();
    expect(auditLog).toContain('SWITCH | work');
    expect(auditLog).toContain('SWITCH | personal');
  });
});
```

**E2E Test Example:**
```typescript
// tests/e2e/full-workflow.test.ts

describe('Full E2E Workflow', () => {
  it('should handle complete token lifecycle', async () => {
    // 1. Initialize with config
    const config = await loadConfig('./test-config.yml');

    // 2. Create profile
    const profileManager = new ProfileManager(config);
    await profileManager.create({
      name: 'test-profile',
      oauth: config.oauth,
    });

    // 3. Store initial token
    const tokenStore = new EncryptedTokenStore({
      encryption: true,
      encryptionKey: 'test-key',
    });
    await tokenStore.write('test-profile', mockTokenData);

    // 4. Initialize auth manager
    const authManager = new AuthManager({
      store: tokenStore,
      refresher: mockRefresher,
      profileId: 'test-profile',
      refreshThreshold: 300,
    });

    // 5. Start background refresh
    authManager.startBackgroundRefresh();

    // 6. Wait for refresh to trigger
    await sleep(61000);  // > 60s

    // 7. Verify token was refreshed
    const refreshed = await tokenStore.read('test-profile');
    expect(refreshed?.accessToken).not.toBe(mockTokenData.accessToken);

    // 8. Cleanup
    authManager.stopBackgroundRefresh();
  });
});
```

---

## Documentation & Polish

### Documentation Files

1. **User Guide** (`docs/user-guide.md`)
   - Installation instructions
   - Configuration walkthrough
   - Common use cases
   - Profile management
   - Troubleshooting

2. **API Reference** (`docs/api-reference.md`)
   - Generate from JSDoc
   - Class diagrams
   - Interface documentation
   - Examples

3. **Troubleshooting Guide** (`docs/troubleshooting.md`)
   - Common errors
   - Platform-specific issues
   - Performance tuning
   - Debug mode

4. **CONTRIBUTING.md**
   - Development setup
   - Code style guide
   - PR process
   - Testing requirements

5. **CHANGELOG.md**
   - Version history
   - Breaking changes
   - Migration guides

---

## Implementation Order & Timeline

### Phase 1: Critical Fixes (Days 1-2)

**Day 1 (4-6 hours)**
- [ ] Morning: Fix all branch coverage gaps
  - TokenRefresher (1h)
  - ConfigLoader (30min)
  - ClaudeWrapper (30min)
  - Run coverage report, verify ≥90%
- [ ] Afternoon: Security fix
  - File permissions (1h)
  - Permission verification (1h)
  - Tests (1h)

**Day 2 (2-3 hours)**
- [ ] Complete GH-04
  - MetricsCollector implementation (1h)
  - Metrics integration (1h)
  - Token rotation tests (30min)
  - Final GH-04 push and tag

**Deliverable:** 100% test coverage, no security issues, GH-04 complete

---

### Phase 2: Core Features (Weeks 1-2)

**Week 1 - Parallel Development**

**Developer A: GH-06 Profile Manager** (10-12h over 3 days)
- Day 3: Types + CRUD operations (4h)
- Day 4: Profile switching + audit log (4h)
- Day 5: CLI integration + tests (4h)

**Developer B: GH-07 Platform Adapters** (10-12h over 3 days)
- Day 3: Platform detection + WSL (4h)
- Day 4: Windows + macOS adapters (4h)
- Day 5: Linux adapter + tests (4h)

**Week 2 - Sequential Development**

**GH-05 Auth Manager** (8-10h over 2 days)
- Day 8: Mutex + AuthManager core (5h)
- Day 9: Background scheduler + tests (5h)

**Deliverable:** All core features complete, ready for integration

---

### Phase 3: Production Hardening (Week 3)

**Days 15-16: Error Handling**
- [ ] Custom error hierarchy (4h)
- [ ] Update all error throws (2h)
- [ ] Error context tests (2h)

**Days 17-18: Reliability**
- [ ] Circuit breaker (3h)
- [ ] Process timeout (2h)
- [ ] Enhanced config (3h)

**Days 19-20: Extract Interfaces**
- [ ] ITokenStore (2h)
- [ ] ILogger (2h)
- [ ] IConfigProvider (2h)
- [ ] Update DI throughout (2h)

**Deliverable:** Production-ready codebase

---

### Phase 4: Integration & Docs (Week 4)

**Days 22-24: GH-08 Integration**
- [ ] Integration harness (6h)
- [ ] E2E tests (6h)
- [ ] Cross-platform verification (2h)

**Days 25-26: Documentation**
- [ ] User guide (4h)
- [ ] API reference (2h)
- [ ] Troubleshooting (2h)
- [ ] Contributing guide (2h)

**Days 27-28: Final Polish**
- [ ] Performance audit (3h)
- [ ] Security audit (2h)
- [ ] Code review (3h)
- [ ] Final testing (3h)

**Deliverable:** Production release

---

## Evidence & Source Analysis

### Code Quality Evidence

**Excellent TypeScript Discipline:**
```typescript
// ✅ Proper error typing
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error';
  throw new Error(`Decryption failed: ${message}`);
}

// ✅ No 'any' without eslint-disable
/* eslint-disable @typescript-eslint/no-explicit-any */
export class Logger {
  trace(msg: string, ...args: any[]): void {
    // Pino uses any[] for args
  }
}

// ✅ Type guards
if (error && typeof error === 'object' && 'code' in error) {
  // Narrowed to { code: unknown }
}
```

**Strong Testing Patterns:**
```typescript
// ✅ Comprehensive test scenarios
describe('EncryptedTokenStore', () => {
  it('should encrypt tokens before writing', async () => {
    // Test encryption
  });

  it('should decrypt tokens after reading', async () => {
    // Test decryption
  });

  it('should handle corrupted files gracefully', async () => {
    // Test error recovery
  });

  it('should create directory if missing', async () => {
    // Test directory creation
  });
});
```

**Excellent Architecture:**
```typescript
// ✅ Dependency injection
export class TokenRefresher {
  constructor(
    private config: RefreshConfig,  // Injected
    retryPolicy?: Partial<RetryPolicy>,  // Optional override
    private metrics?: MetricsCollector  // Optional instrumentation
  ) {}
}

// ✅ Interface segregation
export interface RefreshConfig {
  httpClient: AxiosInstance;  // Generic HTTP client
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}
```

---

### Identified Flaws & Enhancements

**Flaw 1: Missing File Permissions**
```typescript
// ❌ CURRENT (INSECURE)
await writeFile(tempPath, content, 'utf-8');
// Creates file with default permissions (often 0o666 - world-readable!)

// ✅ FIXED
await writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o600 });
// Owner read/write only
```

**Flaw 2: No Process Timeout**
```typescript
// ❌ CURRENT (CAN HANG FOREVER)
const child = spawn(this.config.claudePath, this.config.args, {
  stdio: 'inherit',
});
// No timeout!

// ✅ ENHANCED
const timeout = setTimeout(() => {
  if (!child.killed) {
    child.kill('SIGTERM');
    this.emit('timeout');
  }
}, this.config.timeout || 1800000);

child.on('exit', () => clearTimeout(timeout));
```

**Flaw 3: Generic Error Classes**
```typescript
// ❌ CURRENT (HARD TO HANDLE PROGRAMMATICALLY)
throw new Error('Config file not found');
// Can't distinguish from other Error types

// ✅ ENHANCED
throw new ConfigError('CONFIG_NOT_FOUND', 'Config file not found', {
  path: this.configPath,
  searchedPaths: [defaultPath, customPath],
});
// Type-safe, has error code, includes context
```

**Enhancement 1: Circuit Breaker**
```typescript
// Current: No protection against OAuth server overload
// If OAuth server is down, every request will try and timeout (10s each)
// 100 concurrent requests = 1000s of wasted time

// Enhanced: Circuit breaker opens after 5 failures
// Subsequent requests fail immediately for 60s
// After 60s, try again (half-open state)
```

**Enhancement 2: Request ID Tracking**
```typescript
// Current: Hard to correlate logs across async operations
[INFO] Token refresh started
[INFO] HTTP request sent
[ERROR] Token refresh failed
// Which request failed?

// Enhanced: Request IDs
[INFO] [req-123] Token refresh started
[INFO] [req-123] HTTP request sent
[ERROR] [req-123] Token refresh failed
// Clear correlation!
```

**Enhancement 3: Performance Metrics**
```typescript
// Current: No insight into performance
// Is token refresh slow? Is caching effective?

// Enhanced: Metrics collection
{
  "token_refresh_latency_p50": 123,  // 50th percentile
  "token_refresh_latency_p95": 456,  // 95th percentile
  "token_refresh_latency_p99": 789,  // 99th percentile
  "cache_hit_rate": 0.87,
  "background_refresh_count": 42
}
```

---

## Success Criteria

### Must-Have (MVP)

- [ ] All tests passing (100%)
- [ ] Coverage ≥ 90% (all metrics)
- [ ] No security vulnerabilities
- [ ] All 9 GitHub issues complete
- [ ] Cross-platform tested (Ubuntu, Windows, macOS)
- [ ] Documentation complete

### Should-Have (Production)

- [ ] Custom error hierarchy
- [ ] Circuit breaker implemented
- [ ] Process timeouts
- [ ] Request ID tracking
- [ ] Performance benchmarks
- [ ] Security audit passed

### Nice-to-Have (Future)

- [ ] Grafana dashboard integration
- [ ] Sentry error tracking
- [ ] Performance monitoring
- [ ] Automated dependency updates
- [ ] Release automation

---

## Summary

This implementation plan provides:

1. **Clear Priorities:** Critical fixes → Core features → Hardening → Integration
2. **Parallel Opportunities:** GH-06 and GH-07 can run concurrently
3. **Evidence-Based:** All recommendations backed by code analysis
4. **Actionable:** Each task has acceptance criteria and examples
5. **Time-Boxed:** Realistic estimates based on complexity

**Next Step:** Start with Phase 1 (Critical Fixes) - estimated 2 days to completion.

---

*Generated: 2025-11-14*
*Last Updated: 2025-11-14*
*Version: 1.0*
