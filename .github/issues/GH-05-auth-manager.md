# GH-05: Auth Manager + Scheduler

**Parent**: #1 (Project Blueprint)
**Depends On**: #3 (GH-01 CLI Intercept), #6 (GH-04 Token Refresher)
**Unblocks**: #10 (GH-08 Integration)
**External Dependencies**: None (uses existing components)

---

## Overview

Implements centralized authentication management with mutex-protected token refresh, background scheduler, and audit hooks. Coordinates TokenStore and TokenRefresher to ensure always-valid tokens with minimal latency.

**Key Features**:
- `ensureValidToken()` with mutex (prevents concurrent refresh)
- Background refresh scheduler (checks every 60s)
- Configurable refresh threshold (default 300s before expiry)
- Audit hooks for token events
- Graceful shutdown of background tasks
- Request deduplication for concurrent callers

---

## TDD Workflow (10 Atomic Commits)

### Commit 1: Mutex Test (RED)
**Message**: `test(auth): add mutex test for concurrent refresh`

**Files Changed**:
- `tests/auth/AuthManager.test.ts` (new)

**Code**:
```typescript
import { AuthManager } from '../../src/auth/AuthManager';
import { TokenStore } from '../../src/auth/TokenStore';
import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { TokenData } from '../../src/auth/TokenData';

describe('AuthManager Mutex', () => {
  let authManager: AuthManager;
  let mockStore: jest.Mocked<TokenStore>;
  let mockRefresher: jest.Mocked<TokenRefresher>;

  beforeEach(() => {
    mockStore = {
      read: jest.fn(),
      write: jest.fn()
    } as any;

    mockRefresher = {
      refresh: jest.fn()
    } as any;

    authManager = new AuthManager({
      store: mockStore,
      refresher: mockRefresher,
      profileId: 'test-profile',
      refreshThreshold: 300 // 5 minutes
    });
  });

  it('should serialize concurrent ensureValidToken calls', async () => {
    const expiredToken: TokenData = {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000, // Expired
      grantedAt: Date.now() - 3600000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    const newToken: TokenData = {
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(expiredToken);
    mockRefresher.refresh.mockResolvedValue(newToken);

    // Call ensureValidToken 10 times concurrently
    const promises = Array(10).fill(null).map(() =>
      authManager.ensureValidToken()
    );

    const results = await Promise.all(promises);

    // All should get the same new token
    results.forEach(result => {
      expect(result.accessToken).toBe('new-token');
    });

    // Refresher should be called exactly once (not 10 times)
    expect(mockRefresher.refresh).toHaveBeenCalledTimes(1);
  });

  it('should allow sequential calls without blocking', async () => {
    const validToken: TokenData = {
      accessToken: 'valid-token',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 7200000, // Valid for 2 hours
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(validToken);

    const result1 = await authManager.ensureValidToken();
    const result2 = await authManager.ensureValidToken();

    expect(result1.accessToken).toBe('valid-token');
    expect(result2.accessToken).toBe('valid-token');

    // No refresh needed
    expect(mockRefresher.refresh).not.toHaveBeenCalled();
  });
});
```

**Expected Result**: ❌ RED - AuthManager doesn't exist

---

### Commit 2: Mutex Implementation (GREEN)
**Message**: `feat(auth): implement AuthManager with mutex`

**Files Changed**:
- `src/auth/AuthManager.ts` (new)
- `src/utils/Mutex.ts` (new)

**Code**:
```typescript
// src/utils/Mutex.ts
export class Mutex {
  private locked = false;
  private queue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this.locked) {
      this.locked = true;
      return;
    }

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
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

// src/auth/AuthManager.ts
import { TokenStore } from './TokenStore';
import { TokenRefresher } from './TokenRefresher';
import { TokenData } from './TokenData';
import { Mutex } from '../utils/Mutex';

export interface AuthManagerConfig {
  store: TokenStore;
  refresher: TokenRefresher;
  profileId: string;
  refreshThreshold: number; // seconds before expiry to refresh
}

export class AuthManager {
  private mutex = new Mutex();
  private cachedToken: TokenData | null = null;

  constructor(private config: AuthManagerConfig) {}

  async ensureValidToken(): Promise<TokenData> {
    return this.mutex.runExclusive(async () => {
      // Check cache first
      if (this.cachedToken && !this.needsRefresh(this.cachedToken)) {
        return this.cachedToken;
      }

      // Load from store
      const storedToken = await this.config.store.read(this.config.profileId);

      if (storedToken && !this.needsRefresh(storedToken)) {
        this.cachedToken = storedToken;
        return storedToken;
      }

      // Refresh needed
      if (!storedToken) {
        throw new Error('No token found for profile');
      }

      const newToken = await this.config.refresher.refresh(
        storedToken.refreshToken,
        storedToken.scopes
      );

      // Store and cache
      await this.config.store.write(this.config.profileId, newToken);
      this.cachedToken = newToken;

      return newToken;
    });
  }

  private needsRefresh(token: TokenData): boolean {
    const threshold = this.config.refreshThreshold * 1000;
    return token.expiresAt - threshold <= Date.now();
  }
}
```

**Expected Result**: ✅ GREEN - Mutex tests pass

---

### Commit 3: Refresh Threshold Test (RED)
**Message**: `test(auth): add refresh threshold tests`

**Files Changed**:
- `tests/auth/AuthManager.test.ts` (update)

**Code**:
```typescript
describe('AuthManager Refresh Threshold', () => {
  it('should NOT refresh token with 10 minutes remaining', async () => {
    const tokenWithTime: TokenData = {
      accessToken: 'still-valid',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 600000, // 10 minutes
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(tokenWithTime);

    const result = await authManager.ensureValidToken();

    expect(result.accessToken).toBe('still-valid');
    expect(mockRefresher.refresh).not.toHaveBeenCalled();
  });

  it('should refresh token with 4 minutes remaining (threshold 5 min)', async () => {
    const almostExpired: TokenData = {
      accessToken: 'almost-expired',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 240000, // 4 minutes (below 5 min threshold)
      grantedAt: Date.now() - 3360000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    const newToken: TokenData = {
      accessToken: 'refreshed-token',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(almostExpired);
    mockRefresher.refresh.mockResolvedValue(newToken);

    const result = await authManager.ensureValidToken();

    expect(result.accessToken).toBe('refreshed-token');
    expect(mockRefresher.refresh).toHaveBeenCalledWith(
      'refresh-token',
      ['user:inference']
    );
  });

  it('should use configurable threshold', async () => {
    // Custom manager with 60 second threshold
    const customManager = new AuthManager({
      store: mockStore,
      refresher: mockRefresher,
      profileId: 'test',
      refreshThreshold: 60
    });

    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 90000, // 90 seconds (above 60s threshold)
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(token);

    await customManager.ensureValidToken();

    expect(mockRefresher.refresh).not.toHaveBeenCalled();
  });
});
```

**Expected Result**: ❌ RED - May fail on edge cases

---

### Commit 4: Threshold Implementation Refinement (GREEN)
**Message**: `feat(auth): refine refresh threshold logic`

**Files Changed**:
- `src/auth/AuthManager.ts` (verify)

**Code**:
```typescript
// Implementation already correct from Commit 2
// Just add better documentation

/**
 * Check if token needs refresh based on configured threshold.
 *
 * @param token Token to check
 * @returns true if token expires within threshold window
 */
private needsRefresh(token: TokenData): boolean {
  const thresholdMs = this.config.refreshThreshold * 1000;
  const timeUntilExpiry = token.expiresAt - Date.now();
  return timeUntilExpiry <= thresholdMs;
}
```

**Expected Result**: ✅ GREEN - Threshold tests pass

---

### Commit 5: Background Scheduler Test (RED)
**Message**: `test(auth): add background refresh scheduler tests`

**Files Changed**:
- `tests/auth/AuthManager.test.ts` (update)

**Code**:
```typescript
describe('AuthManager Background Scheduler', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start background refresh scheduler', async () => {
    const token: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 200000, // 200 seconds (below 300s threshold)
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    const newToken: TokenData = {
      ...token,
      accessToken: 'bg-refreshed',
      expiresAt: Date.now() + 3600000
    };

    mockStore.read.mockResolvedValue(token);
    mockRefresher.refresh.mockResolvedValue(newToken);

    authManager.startBackgroundRefresh(60000); // Check every 60 seconds

    // Advance timer by 60 seconds
    jest.advanceTimersByTime(60000);

    // Wait for async operations
    await Promise.resolve();

    expect(mockRefresher.refresh).toHaveBeenCalled();
  });

  it('should skip refresh if token still valid', async () => {
    const validToken: TokenData = {
      accessToken: 'valid',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 7200000, // 2 hours (well above threshold)
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(validToken);

    authManager.startBackgroundRefresh(60000);

    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    expect(mockRefresher.refresh).not.toHaveBeenCalled();
  });

  it('should stop scheduler on dispose', async () => {
    authManager.startBackgroundRefresh(60000);

    authManager.dispose();

    // Advance timer - should not trigger refresh
    jest.advanceTimersByTime(120000);
    await Promise.resolve();

    expect(mockRefresher.refresh).not.toHaveBeenCalled();
  });
});
```

**Expected Result**: ❌ RED - Background scheduler doesn't exist

---

### Commit 6: Background Scheduler Implementation (GREEN)
**Message**: `feat(auth): implement background refresh scheduler`

**Files Changed**:
- `src/auth/AuthManager.ts` (update)

**Code**:
```typescript
export class AuthManager {
  private mutex = new Mutex();
  private cachedToken: TokenData | null = null;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(private config: AuthManagerConfig) {}

  async ensureValidToken(): Promise<TokenData> {
    // ... (existing implementation)
  }

  /**
   * Start background refresh scheduler.
   *
   * @param intervalMs Check interval in milliseconds (default 60000)
   */
  startBackgroundRefresh(intervalMs = 60000): void {
    if (this.schedulerInterval) {
      return; // Already started
    }

    this.schedulerInterval = setInterval(async () => {
      try {
        await this.backgroundRefreshTick();
      } catch (error) {
        console.error('Background refresh failed:', error);
      }
    }, intervalMs);

    // Don't prevent process exit
    if (this.schedulerInterval.unref) {
      this.schedulerInterval.unref();
    }
  }

  /**
   * Stop background refresh scheduler.
   */
  stopBackgroundRefresh(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Dispose resources and stop background tasks.
   */
  dispose(): void {
    this.stopBackgroundRefresh();
  }

  private async backgroundRefreshTick(): Promise<void> {
    // Use mutex to avoid conflicts with manual calls
    await this.mutex.runExclusive(async () => {
      const token = await this.config.store.read(this.config.profileId);

      if (!token) {
        return; // No token to refresh
      }

      if (!this.needsRefresh(token)) {
        return; // Still valid
      }

      // Refresh needed
      const newToken = await this.config.refresher.refresh(
        token.refreshToken,
        token.scopes
      );

      await this.config.store.write(this.config.profileId, newToken);
      this.cachedToken = newToken;
    });
  }

  private needsRefresh(token: TokenData): boolean {
    const thresholdMs = this.config.refreshThreshold * 1000;
    const timeUntilExpiry = token.expiresAt - Date.now();
    return timeUntilExpiry <= thresholdMs;
  }
}
```

**Expected Result**: ✅ GREEN - Scheduler tests pass

---

### Commit 7: Concurrent Request Dedup Test (RED)
**Message**: `test(auth): add request deduplication test`

**Files Changed**:
- `tests/auth/AuthManager.test.ts` (update)

**Code**:
```typescript
describe('AuthManager Request Deduplication', () => {
  it('should deduplicate concurrent requests during refresh', async () => {
    const expiredToken: TokenData = {
      accessToken: 'expired',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000,
      grantedAt: Date.now() - 3600000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    const newToken: TokenData = {
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(expiredToken);

    // Slow refresh (simulate network delay)
    mockRefresher.refresh.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return newToken;
    });

    // Fire 20 concurrent requests
    const start = Date.now();
    const promises = Array(20).fill(null).map(() =>
      authManager.ensureValidToken()
    );

    const results = await Promise.all(promises);

    // All get the same token
    results.forEach(r => expect(r.accessToken).toBe('new-token'));

    // Only refreshed once
    expect(mockRefresher.refresh).toHaveBeenCalledTimes(1);

    // Total time should be ~100ms, not 2000ms (20 * 100ms)
    expect(Date.now() - start).toBeLessThan(300);
  });

  it('should handle cache hit during concurrent refresh', async () => {
    const token: TokenData = {
      accessToken: 'cached',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 7200000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(token);

    // First call populates cache
    await authManager.ensureValidToken();

    // Clear mock
    mockStore.read.mockClear();

    // 10 concurrent calls should use cache
    const promises = Array(10).fill(null).map(() =>
      authManager.ensureValidToken()
    );

    const results = await Promise.all(promises);

    results.forEach(r => expect(r.accessToken).toBe('cached'));

    // Store not accessed (cache hit)
    expect(mockStore.read).not.toHaveBeenCalled();
  });
});
```

**Expected Result**: ❌ RED - Deduplication behavior needs verification

---

### Commit 8: Deduplication Verification (GREEN)
**Message**: `feat(auth): verify request deduplication works`

**Files Changed**:
- `src/auth/AuthManager.ts` (verify, add comments)

**Code**:
```typescript
// Implementation already provides deduplication via mutex
// Add documentation

/**
 * Ensure a valid access token is available.
 *
 * This method is thread-safe and deduplicates concurrent requests.
 * Multiple concurrent calls will wait for a single refresh operation
 * rather than triggering multiple refreshes.
 *
 * @returns Valid TokenData
 * @throws Error if no token exists or refresh fails
 */
async ensureValidToken(): Promise<TokenData> {
  return this.mutex.runExclusive(async () => {
    // Check cache first (fast path for concurrent callers)
    if (this.cachedToken && !this.needsRefresh(this.cachedToken)) {
      return this.cachedToken;
    }

    // Load from store
    const storedToken = await this.config.store.read(this.config.profileId);

    if (storedToken && !this.needsRefresh(storedToken)) {
      this.cachedToken = storedToken;
      return storedToken;
    }

    // Refresh needed
    if (!storedToken) {
      throw new Error(`No token found for profile: ${this.config.profileId}`);
    }

    const newToken = await this.config.refresher.refresh(
      storedToken.refreshToken,
      storedToken.scopes
    );

    // Store and cache
    await this.config.store.write(this.config.profileId, newToken);
    this.cachedToken = newToken;

    return newToken;
  });
}
```

**Expected Result**: ✅ GREEN - Deduplication tests pass

---

### Commit 9: Audit Hooks Test (RED)
**Message**: `test(auth): add audit event hooks`

**Files Changed**:
- `tests/auth/AuthManager.test.ts` (update)

**Code**:
```typescript
describe('AuthManager Audit Hooks', () => {
  it('should emit event on token refresh', async () => {
    const events: any[] = [];

    const managerWithHooks = new AuthManager({
      store: mockStore,
      refresher: mockRefresher,
      profileId: 'test',
      refreshThreshold: 300,
      onTokenRefresh: (event) => events.push(event)
    });

    const expiredToken: TokenData = {
      accessToken: 'old',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000,
      grantedAt: Date.now() - 3600000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    const newToken: TokenData = {
      accessToken: 'new',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    mockStore.read.mockResolvedValue(expiredToken);
    mockRefresher.refresh.mockResolvedValue(newToken);

    await managerWithHooks.ensureValidToken();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'token_refresh',
      profileId: 'test',
      timestamp: expect.any(Number)
    });
  });

  it('should emit event on cache invalidation', async () => {
    const events: any[] = [];

    const managerWithHooks = new AuthManager({
      store: mockStore,
      refresher: mockRefresher,
      profileId: 'test',
      refreshThreshold: 300,
      onInvalidate: (event) => events.push(event)
    });

    managerWithHooks.invalidate('user_logout');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'invalidate',
      reason: 'user_logout'
    });
  });
});
```

**Expected Result**: ❌ RED - Audit hooks don't exist

---

### Commit 10: Audit Hooks Implementation (GREEN)
**Message**: `feat(auth): add audit event hooks`

**Files Changed**:
- `src/auth/AuthManager.ts` (update)
- `src/auth/types.ts` (update)

**Code**:
```typescript
// src/auth/types.ts (update)
export interface AuditEvent {
  type: string;
  profileId: string;
  timestamp: number;
  details?: Record<string, any>;
}

export interface AuthManagerConfig {
  store: TokenStore;
  refresher: TokenRefresher;
  profileId: string;
  refreshThreshold: number;
  onTokenRefresh?: (event: AuditEvent) => void;
  onInvalidate?: (event: AuditEvent) => void;
}

// src/auth/AuthManager.ts (update)
export class AuthManager {
  private mutex = new Mutex();
  private cachedToken: TokenData | null = null;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor(private config: AuthManagerConfig) {}

  async ensureValidToken(): Promise<TokenData> {
    return this.mutex.runExclusive(async () => {
      if (this.cachedToken && !this.needsRefresh(this.cachedToken)) {
        return this.cachedToken;
      }

      const storedToken = await this.config.store.read(this.config.profileId);

      if (storedToken && !this.needsRefresh(storedToken)) {
        this.cachedToken = storedToken;
        return storedToken;
      }

      if (!storedToken) {
        throw new Error(`No token found for profile: ${this.config.profileId}`);
      }

      const newToken = await this.config.refresher.refresh(
        storedToken.refreshToken,
        storedToken.scopes
      );

      await this.config.store.write(this.config.profileId, newToken);
      this.cachedToken = newToken;

      // Emit audit event
      this.emitRefreshEvent();

      return newToken;
    });
  }

  /**
   * Invalidate cached token.
   *
   * @param reason Reason for invalidation (for audit)
   */
  invalidate(reason: string): void {
    this.cachedToken = null;

    if (this.config.onInvalidate) {
      this.config.onInvalidate({
        type: 'invalidate',
        profileId: this.config.profileId,
        timestamp: Date.now(),
        details: { reason }
      });
    }
  }

  private emitRefreshEvent(): void {
    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh({
        type: 'token_refresh',
        profileId: this.config.profileId,
        timestamp: Date.now()
      });
    }
  }

  // ... (rest of implementation)
}
```

**Expected Result**: ✅ GREEN - Audit hooks tests pass

---

## Acceptance Criteria

ensureValidToken:
- [ ] Returns valid token from cache
- [ ] Loads token from store if cache miss
- [ ] Refreshes token when below threshold
- [ ] Throws error if no token exists
- [ ] Uses mutex to prevent concurrent refresh
- [ ] Deduplicates concurrent requests
- [ ] Updates cache after refresh
- [ ] Persists refreshed token to store

Background Scheduler:
- [ ] Starts on startBackgroundRefresh()
- [ ] Checks token periodically (configurable interval)
- [ ] Refreshes when below threshold
- [ ] Skips refresh when token valid
- [ ] Stops on dispose()
- [ ] Doesn't prevent process exit (unref)
- [ ] Handles errors gracefully

Refresh Threshold:
- [ ] Configurable threshold (seconds)
- [ ] Default 300 seconds (5 minutes)
- [ ] Refreshes when time remaining ≤ threshold
- [ ] Skips refresh when time remaining > threshold

Audit Hooks:
- [ ] Emits onTokenRefresh event
- [ ] Emits onInvalidate event
- [ ] Includes profileId in events
- [ ] Includes timestamp in events
- [ ] Optional hooks (works without)

Cache Management:
- [ ] Caches token after load
- [ ] Caches token after refresh
- [ ] Cache invalidation works
- [ ] Cache checked before store read

---

## Testing Strategy

### Unit Tests
```typescript
// Mutex
- Concurrent calls deduplicated
- Sequential calls work
- Mutex released on error

// Threshold
- Refresh when below threshold
- Skip refresh when above
- Custom threshold works

// Scheduler
- Starts background refresh
- Stops on dispose
- Skips when token valid
- Handles errors

// Deduplication
- 20 concurrent calls → 1 refresh
- Cache hit avoids store read
- Performance (concurrent < sequential)

// Audit
- Refresh event emitted
- Invalidate event emitted
- Events include metadata
```

### Integration Tests
```typescript
// Full Flow
- Load token → check threshold → refresh → store → cache
- Background refresh updates cache
- Concurrent CLI commands share token

// Error Scenarios
- No token in store
- Refresh fails (retries exhausted)
- Store write fails
```

---

## Success Metrics

- **Test Coverage**: ≥95%
- **Test Pass Rate**: 100%
- **Concurrency**: 100 concurrent calls → 1 refresh
- **Performance**: ensureValidToken < 10ms (cached)
- **Reliability**: Background refresh 99.9% success

---

## Downstream Impact

**Unblocks**:
- GH-08: Integration tests need AuthManager
- CLI commands use ensureValidToken

**Provides**:
- `AuthManager` class
- `Mutex` utility
- Audit hooks for telemetry
- Background refresh capability

---

## Definition of Done

Development:
- [ ] All 10 commits completed following TDD
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Code reviewed and approved

Documentation:
- [ ] JSDoc on public APIs
- [ ] Scheduler behavior documented
- [ ] Audit hooks documented

Testing:
- [ ] 95%+ code coverage
- [ ] Concurrency tested (100+ concurrent)
- [ ] Background scheduler tested

Performance:
- [ ] Cache hit < 1ms
- [ ] Mutex overhead < 5ms

---

## Related Files

```
src/
├── auth/
│   ├── AuthManager.ts    # Main manager + scheduler
│   └── types.ts          # AuditEvent, AuthManagerConfig
└── utils/
    └── Mutex.ts          # Simple mutex implementation

tests/
└── auth/
    └── AuthManager.test.ts  # All AuthManager tests
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/05-auth-manager

# Work through 10 TDD commits
git push -u origin feat/05-auth-manager
gh pr create --title "feat: auth manager with scheduler" \
  --body "Implements GH-05: Auth Manager (closes #7)"
```

---

## Estimated Effort

**Time**: 8-10 hours
**Complexity**: High
**Risk**: Medium (concurrency tricky)

**Breakdown**:
- Mutex implementation: 2 hours
- ensureValidToken: 2 hours
- Background scheduler: 2 hours
- Deduplication testing: 2 hours
- Audit hooks: 1 hour
- Integration tests: 1.5 hours

**Dependencies**: GH-01 (CLI), GH-04 (Refresher), GH-03 (Store)
