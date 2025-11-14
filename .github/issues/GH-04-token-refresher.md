# GH-04: Token Refresher + Retry Policy

**Parent**: #1 (Project Blueprint)
**Depends On**: #2 (GH-00 Foundation), #5 (GH-03 Token Store)
**Unblocks**: #7 (GH-05 Auth Manager)
**External Dependencies**: `axios`, `retry-axios`

---

## Overview

Implements OAuth token refresh flow with exponential backoff, jitter, and metrics instrumentation. Handles rate limiting (429), network errors, and refresh token expiration gracefully.

**Key Features**:
- OAuth 2.0 refresh token flow
- Exponential backoff with jitter (1s, 2s, 4s, 8s)
- Retry policy for transient errors (429, 5xx)
- Metrics instrumentation (latency, failures)
- Refresh token rotation support
- Device fingerprint validation

---

## TDD Workflow (10 Atomic Commits)

### Commit 1: Refresh Success Test (RED)
**Message**: `test(auth): add token refresh success test`

**Files Changed**:
- `tests/auth/TokenRefresher.test.ts` (new)

**Code**:
```typescript
import { TokenRefresher } from '../../src/auth/TokenRefresher';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('TokenRefresher Success', () => {
  let refresher: TokenRefresher;
  let mockHttp: MockAdapter;

  beforeEach(() => {
    const httpClient = axios.create();
    mockHttp = new MockAdapter(httpClient);
    refresher = new TokenRefresher({
      httpClient,
      tokenUrl: 'https://api.anthropic.com/oauth/token',
      clientId: 'test-client-id'
    });
  });

  afterEach(() => {
    mockHttp.reset();
  });

  it('should refresh token successfully', async () => {
    const refreshToken = 'refresh-token-123';
    const now = Date.now();

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(200, {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    });

    const result = await refresher.refresh(refreshToken, ['user:inference']);

    expect(result).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      tokenType: 'Bearer',
      scopes: ['user:inference']
    });
    expect(result.expiresAt).toBeGreaterThan(now);
    expect(result.expiresAt).toBeLessThan(now + 3700000);
  });

  it('should include client credentials in request', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply((config) => {
      const data = JSON.parse(config.data);
      expect(data).toMatchObject({
        grant_type: 'refresh_token',
        refresh_token: 'test-refresh',
        client_id: 'test-client-id'
      });
      return [200, { access_token: 'new', refresh_token: 'new', expires_in: 3600 }];
    });

    await refresher.refresh('test-refresh', ['user:inference']);
  });
});
```

**Expected Result**: ❌ RED - TokenRefresher doesn't exist

---

### Commit 2: Refresh Success Implementation (GREEN)
**Message**: `feat(auth): implement basic token refresh`

**Files Changed**:
- `src/auth/TokenRefresher.ts` (new)
- `src/auth/types.ts` (new)

**Code**:
```typescript
// src/auth/types.ts
export interface RefreshConfig {
  httpClient: any; // axios instance
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

// src/auth/TokenRefresher.ts
import { TokenData } from './TokenData';
import { RefreshConfig, OAuthTokenResponse } from './types';

export class TokenRefresher {
  constructor(private config: RefreshConfig) {}

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
    const response = await this.config.httpClient.post<OAuthTokenResponse>(
      this.config.tokenUrl,
      {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        ...(this.config.clientSecret && { client_secret: this.config.clientSecret })
      }
    );

    const data = response.data;
    const now = Date.now();

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now + (data.expires_in * 1000),
      grantedAt: now,
      scopes: data.scope.split(' '),
      tokenType: data.token_type as 'Bearer',
      deviceFingerprint: this.generateFingerprint()
    };
  }

  private generateFingerprint(): string {
    // Simple fingerprint for now
    return `${process.platform}-${process.version}`;
  }
}
```

**Expected Result**: ✅ GREEN - Success test passes

---

### Commit 3: Retry Test for 429 (RED)
**Message**: `test(auth): add retry test for rate limiting`

**Files Changed**:
- `tests/auth/TokenRefresher.test.ts` (update)

**Code**:
```typescript
describe('TokenRefresher Retry Logic', () => {
  it('should retry on 429 rate limit', async () => {
    let attempts = 0;

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(() => {
      attempts++;
      if (attempts < 3) {
        return [429, { error: 'rate_limit_exceeded' }];
      }
      return [200, {
        access_token: 'success-after-retry',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user:inference'
      }];
    });

    const result = await refresher.refresh('test-refresh', ['user:inference']);

    expect(attempts).toBe(3);
    expect(result.accessToken).toBe('success-after-retry');
  });

  it('should retry on 5xx server errors', async () => {
    let attempts = 0;

    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(() => {
      attempts++;
      if (attempts < 2) {
        return [500, { error: 'internal_error' }];
      }
      return [200, {
        access_token: 'success',
        refresh_token: 'new',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user:inference'
      }];
    });

    const result = await refresher.refresh('test-refresh', ['user:inference']);

    expect(attempts).toBe(2);
    expect(result.accessToken).toBe('success');
  });

  it('should NOT retry on 401 invalid grant', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(401, {
      error: 'invalid_grant',
      error_description: 'refresh token expired'
    });

    await expect(
      refresher.refresh('expired-refresh', ['user:inference'])
    ).rejects.toThrow(/invalid_grant/);
  });

  it('should fail after max retries', async () => {
    mockHttp.onPost('https://api.anthropic.com/oauth/token').reply(429, {
      error: 'rate_limit_exceeded'
    });

    await expect(
      refresher.refresh('test-refresh', ['user:inference'])
    ).rejects.toThrow(/rate_limit|max retries/i);
  });
});
```

**Expected Result**: ❌ RED - Retry logic not implemented

---

### Commit 4: Retry Implementation with Backoff (GREEN)
**Message**: `feat(auth): implement exponential backoff retry`

**Files Changed**:
- `src/auth/TokenRefresher.ts` (update)
- `src/auth/retryPolicy.ts` (new)

**Code**:
```typescript
// src/auth/retryPolicy.ts
export interface RetryPolicy {
  maxAttempts: number;
  retryableStatusCodes: number[];
  getDelayMs(attempt: number): number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  getDelayMs(attempt: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s
    return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
  }
};

export function shouldRetry(statusCode: number, attempt: number, policy: RetryPolicy): boolean {
  return (
    policy.retryableStatusCodes.includes(statusCode) &&
    attempt < policy.maxAttempts
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// src/auth/TokenRefresher.ts (update)
import { DEFAULT_RETRY_POLICY, shouldRetry, sleep, RetryPolicy } from './retryPolicy';

export class TokenRefresher {
  private retryPolicy: RetryPolicy;

  constructor(
    private config: RefreshConfig,
    retryPolicy?: Partial<RetryPolicy>
  ) {
    this.retryPolicy = { ...DEFAULT_RETRY_POLICY, ...retryPolicy };
  }

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
    let attempt = 0;
    let lastError: any;

    while (attempt < this.retryPolicy.maxAttempts) {
      attempt++;

      try {
        const response = await this.config.httpClient.post<OAuthTokenResponse>(
          this.config.tokenUrl,
          {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.config.clientId,
            ...(this.config.clientSecret && { client_secret: this.config.clientSecret })
          }
        );

        const data = response.data;
        const now = Date.now();

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: now + (data.expires_in * 1000),
          grantedAt: now,
          scopes: data.scope.split(' '),
          tokenType: data.token_type as 'Bearer',
          deviceFingerprint: this.generateFingerprint()
        };
      } catch (error: any) {
        lastError = error;

        const statusCode = error.response?.status;

        // Don't retry on 401 (invalid grant)
        if (statusCode === 401) {
          throw new Error(
            `Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`
          );
        }

        // Check if we should retry
        if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
          break;
        }

        // Wait before retry
        const delayMs = this.retryPolicy.getDelayMs(attempt);
        await sleep(delayMs);
      }
    }

    throw new Error(
      `Token refresh failed after ${attempt} attempts: ${lastError.message}`
    );
  }

  private generateFingerprint(): string {
    return `${process.platform}-${process.version}`;
  }
}
```

**Expected Result**: ✅ GREEN - Retry tests pass

---

### Commit 5: Jitter Test (RED)
**Message**: `test(auth): add jitter to backoff delays`

**Files Changed**:
- `tests/auth/retryPolicy.test.ts` (new)

**Code**:
```typescript
import { applyJitter, DEFAULT_RETRY_POLICY } from '../../src/auth/retryPolicy';

describe('Retry Policy Jitter', () => {
  it('should apply jitter within ±20% range', () => {
    const baseDelay = 1000;
    const samples: number[] = [];

    // Generate 100 samples
    for (let i = 0; i < 100; i++) {
      samples.push(applyJitter(baseDelay));
    }

    // All samples should be within ±20%
    samples.forEach(sample => {
      expect(sample).toBeGreaterThanOrEqual(800);
      expect(sample).toBeLessThanOrEqual(1200);
    });

    // Verify we're getting distribution (not all same value)
    const unique = new Set(samples);
    expect(unique.size).toBeGreaterThan(50); // At least 50 unique values
  });

  it('should handle zero delay', () => {
    const jittered = applyJitter(0);
    expect(jittered).toBe(0);
  });

  it('should maintain average around base delay', () => {
    const baseDelay = 2000;
    const samples: number[] = [];

    for (let i = 0; i < 1000; i++) {
      samples.push(applyJitter(baseDelay));
    }

    const avg = samples.reduce((a, b) => a + b, 0) / samples.length;

    // Average should be close to base delay (within 5%)
    expect(avg).toBeGreaterThan(1900);
    expect(avg).toBeLessThan(2100);
  });
});
```

**Expected Result**: ❌ RED - applyJitter doesn't exist

---

### Commit 6: Jitter Implementation (GREEN)
**Message**: `feat(auth): add jitter to retry backoff`

**Files Changed**:
- `src/auth/retryPolicy.ts` (update)

**Code**:
```typescript
export interface RetryPolicy {
  maxAttempts: number;
  retryableStatusCodes: number[];
  getDelayMs(attempt: number): number;
  applyJitter: boolean;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 4,
  retryableStatusCodes: [429, 500, 502, 503, 504],
  applyJitter: true,
  getDelayMs(attempt: number): number {
    return Math.min(1000 * Math.pow(2, attempt - 1), 8000);
  }
};

/**
 * Apply jitter to delay (±20% random variation)
 */
export function applyJitter(delayMs: number): number {
  if (delayMs === 0) return 0;

  const jitterRange = 0.2; // ±20%
  const minDelay = delayMs * (1 - jitterRange);
  const maxDelay = delayMs * (1 + jitterRange);

  return Math.floor(minDelay + Math.random() * (maxDelay - minDelay));
}

// Update TokenRefresher to use jitter
async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
  let attempt = 0;
  let lastError: any;

  while (attempt < this.retryPolicy.maxAttempts) {
    attempt++;

    try {
      // ... (same request logic)
    } catch (error: any) {
      lastError = error;
      const statusCode = error.response?.status;

      if (statusCode === 401) {
        throw new Error(
          `Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`
        );
      }

      if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
        break;
      }

      // Apply jitter to delay
      let delayMs = this.retryPolicy.getDelayMs(attempt);
      if (this.retryPolicy.applyJitter) {
        delayMs = applyJitter(delayMs);
      }

      await sleep(delayMs);
    }
  }

  throw new Error(
    `Token refresh failed after ${attempt} attempts: ${lastError.message}`
  );
}
```

**Expected Result**: ✅ GREEN - Jitter tests pass

---

### Commit 7: Metrics Test (RED)
**Message**: `test(auth): add metrics instrumentation tests`

**Files Changed**:
- `tests/auth/TokenRefresher.test.ts` (update)

**Code**:
```typescript
import { MetricsCollector } from '../../src/telemetry/MetricsCollector';

describe('TokenRefresher Metrics', () => {
  let metrics: MetricsCollector;

  beforeEach(() => {
    metrics = new MetricsCollector();
    refresher = new TokenRefresher(
      {
        httpClient: axios.create(),
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client'
      },
      undefined,
      metrics
    );
    mockHttp = new MockAdapter(refresher['config'].httpClient);
  });

  it('should record successful refresh latency', async () => {
    mockHttp.onPost().reply(200, {
      access_token: 'test',
      refresh_token: 'test',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    });

    await refresher.refresh('test-refresh', ['user:inference']);

    const latency = metrics.getMetric('token_refresh_latency_ms');
    expect(latency).toBeGreaterThan(0);
    expect(latency).toBeLessThan(1000);
  });

  it('should increment failure counter on error', async () => {
    mockHttp.onPost().reply(401, { error: 'invalid_grant' });

    await expect(
      refresher.refresh('bad-token', ['user:inference'])
    ).rejects.toThrow();

    const failures = metrics.getCounter('token_refresh_failures_total');
    expect(failures).toBe(1);
  });

  it('should tag metrics with status code', async () => {
    mockHttp.onPost().reply(429, { error: 'rate_limit' });

    await expect(
      refresher.refresh('test', ['user:inference'])
    ).rejects.toThrow();

    const tags = metrics.getLastTags();
    expect(tags).toMatchObject({
      status_code: 429,
      error_type: 'rate_limit'
    });
  });

  it('should record retry count', async () => {
    let attempts = 0;
    mockHttp.onPost().reply(() => {
      attempts++;
      if (attempts < 3) return [429, {}];
      return [200, {
        access_token: 'test',
        refresh_token: 'test',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user:inference'
      }];
    });

    await refresher.refresh('test', ['user:inference']);

    const retries = metrics.getMetric('token_refresh_retries');
    expect(retries).toBe(2); // 3 attempts = 2 retries
  });
});
```

**Expected Result**: ❌ RED - Metrics not implemented

---

### Commit 8: Metrics Implementation (GREEN)
**Message**: `feat(auth): add metrics instrumentation to refresher`

**Files Changed**:
- `src/auth/TokenRefresher.ts` (update)
- `src/telemetry/MetricsCollector.ts` (new)

**Code**:
```typescript
// src/telemetry/MetricsCollector.ts
export class MetricsCollector {
  private metrics = new Map<string, number>();
  private counters = new Map<string, number>();
  private lastTags: Record<string, any> = {};

  recordMetric(name: string, value: number, tags?: Record<string, any>): void {
    this.metrics.set(name, value);
    if (tags) {
      this.lastTags = tags;
    }
  }

  incrementCounter(name: string, tags?: Record<string, any>): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
    if (tags) {
      this.lastTags = tags;
    }
  }

  getMetric(name: string): number | undefined {
    return this.metrics.get(name);
  }

  getCounter(name: string): number {
    return this.counters.get(name) || 0;
  }

  getLastTags(): Record<string, any> {
    return this.lastTags;
  }
}

// src/auth/TokenRefresher.ts (update)
import { MetricsCollector } from '../telemetry/MetricsCollector';

export class TokenRefresher {
  constructor(
    private config: RefreshConfig,
    private retryPolicy: RetryPolicy = DEFAULT_RETRY_POLICY,
    private metrics?: MetricsCollector
  ) {}

  async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
    const startTime = Date.now();
    let attempt = 0;
    let lastError: any;

    while (attempt < this.retryPolicy.maxAttempts) {
      attempt++;

      try {
        const response = await this.config.httpClient.post<OAuthTokenResponse>(
          this.config.tokenUrl,
          {
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: this.config.clientId,
            ...(this.config.clientSecret && { client_secret: this.config.clientSecret })
          }
        );

        const data = response.data;
        const now = Date.now();

        // Record success metrics
        if (this.metrics) {
          this.metrics.recordMetric('token_refresh_latency_ms', now - startTime);
          if (attempt > 1) {
            this.metrics.recordMetric('token_refresh_retries', attempt - 1);
          }
        }

        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: now + (data.expires_in * 1000),
          grantedAt: now,
          scopes: data.scope.split(' '),
          tokenType: data.token_type as 'Bearer',
          deviceFingerprint: this.generateFingerprint()
        };
      } catch (error: any) {
        lastError = error;
        const statusCode = error.response?.status;

        if (statusCode === 401) {
          if (this.metrics) {
            this.metrics.incrementCounter('token_refresh_failures_total', {
              status_code: 401,
              error_type: 'invalid_grant'
            });
          }
          throw new Error(
            `Token refresh failed: ${error.response?.data?.error || 'invalid_grant'}`
          );
        }

        if (!shouldRetry(statusCode, attempt, this.retryPolicy)) {
          if (this.metrics) {
            this.metrics.incrementCounter('token_refresh_failures_total', {
              status_code: statusCode,
              error_type: error.response?.data?.error || 'unknown'
            });
          }
          break;
        }

        let delayMs = this.retryPolicy.getDelayMs(attempt);
        if (this.retryPolicy.applyJitter) {
          delayMs = applyJitter(delayMs);
        }

        await sleep(delayMs);
      }
    }

    if (this.metrics) {
      this.metrics.incrementCounter('token_refresh_failures_total', {
        error_type: 'max_retries_exceeded'
      });
    }

    throw new Error(
      `Token refresh failed after ${attempt} attempts: ${lastError.message}`
    );
  }

  private generateFingerprint(): string {
    return `${process.platform}-${process.version}`;
  }
}
```

**Expected Result**: ✅ GREEN - Metrics tests pass

---

### Commit 9: Refresh Token Rotation Test (RED)
**Message**: `test(auth): add refresh token rotation test`

**Files Changed**:
- `tests/auth/TokenRefresher.test.ts` (update)

**Code**:
```typescript
describe('Refresh Token Rotation', () => {
  it('should handle refresh token rotation', async () => {
    const oldRefreshToken = 'old-refresh-token';

    mockHttp.onPost().reply(200, {
      access_token: 'new-access',
      refresh_token: 'rotated-refresh-token', // New refresh token
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    });

    const result = await refresher.refresh(oldRefreshToken, ['user:inference']);

    expect(result.refreshToken).toBe('rotated-refresh-token');
    expect(result.refreshToken).not.toBe(oldRefreshToken);
  });

  it('should preserve refresh token if not rotated', async () => {
    const originalRefresh = 'static-refresh-token';

    // Some OAuth servers don't rotate refresh tokens
    mockHttp.onPost().reply(200, {
      access_token: 'new-access',
      refresh_token: originalRefresh, // Same token
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    });

    const result = await refresher.refresh(originalRefresh, ['user:inference']);

    expect(result.refreshToken).toBe(originalRefresh);
  });
});
```

**Expected Result**: ❌ RED - May fail if rotation not explicitly tested

---

### Commit 10: Refresh Token Rotation Support (GREEN)
**Message**: `feat(auth): support refresh token rotation`

**Files Changed**:
- `src/auth/TokenRefresher.ts` (verify implementation)
- Documentation comments

**Code**:
```typescript
// Add documentation to TokenRefresher
/**
 * Refresh an OAuth token using a refresh token.
 *
 * Supports refresh token rotation - the returned TokenData will contain
 * the new refresh token if the server rotates it, or the same refresh token
 * if the server uses static refresh tokens.
 *
 * @param refreshToken The current refresh token
 * @param scopes Requested OAuth scopes
 * @returns New TokenData with refreshed access token (and possibly new refresh token)
 * @throws Error if refresh fails after retries or on invalid_grant
 */
async refresh(refreshToken: string, scopes: string[]): Promise<TokenData> {
  // Implementation already handles this correctly by using response.data.refresh_token
  // No code changes needed, just verification and documentation
}
```

**Expected Result**: ✅ GREEN - Rotation tests pass (implementation already correct)

---

## Acceptance Criteria

Token Refresh:
- [ ] Successfully refreshes valid token
- [ ] Includes correct OAuth parameters (grant_type, refresh_token, client_id)
- [ ] Supports optional client_secret
- [ ] Calculates correct expiresAt from expires_in
- [ ] Parses scopes from space-separated string
- [ ] Generates device fingerprint
- [ ] Supports refresh token rotation

Retry Logic:
- [ ] Retries on 429 rate limit
- [ ] Retries on 5xx server errors
- [ ] Does NOT retry on 401 invalid grant
- [ ] Fails after max retries (default 4)
- [ ] Uses exponential backoff (1s, 2s, 4s, 8s)
- [ ] Applies jitter (±20%) to delays
- [ ] Configurable retry policy

Error Handling:
- [ ] Throws on invalid_grant (401)
- [ ] Throws on max retries exceeded
- [ ] Throws on network errors (after retries)
- [ ] Includes error details in message

Metrics:
- [ ] Records token_refresh_latency_ms
- [ ] Records token_refresh_failures_total
- [ ] Records token_refresh_retries
- [ ] Tags with status_code
- [ ] Tags with error_type

Performance:
- [ ] Successful refresh < 500ms (network mocked)
- [ ] Retry delays respect jitter bounds

---

## Testing Strategy

### Unit Tests
```typescript
// Success Cases
- Basic token refresh
- With client secret
- Refresh token rotation
- Static refresh token

// Retry Cases
- Retry on 429
- Retry on 500/502/503/504
- Success after retries
- Fail after max retries
- No retry on 401

// Jitter
- Jitter within ±20%
- Average close to base delay
- Zero delay handling

// Metrics
- Latency recording
- Failure counter
- Retry count
- Tag propagation

// Error Handling
- Invalid grant (401)
- Network timeout
- Malformed response
- Missing fields in response
```

### Integration Tests
```typescript
// Real HTTP Retry
- Mock slow server responses
- Verify backoff timing
- Concurrent refresh requests

// With TokenStore
- Refresh → Store → Verify persistence
```

---

## Success Metrics

- **Test Coverage**: ≥95%
- **Test Pass Rate**: 100%
- **Retry Success**: ≥99% for transient errors
- **Performance**: Refresh < 500ms (mocked)

---

## Downstream Impact

**Unblocks**:
- GH-05: Auth Manager uses TokenRefresher for background refresh
- GH-06: Profile Manager may trigger refresh on profile switch

**Provides**:
- `TokenRefresher` class with retry logic
- `RetryPolicy` configuration
- `MetricsCollector` for telemetry
- Jitter utilities

---

## Definition of Done

Development:
- [ ] All 10 commits completed following TDD
- [ ] All unit tests passing
- [ ] Code reviewed and approved
- [ ] No TypeScript errors
- [ ] ESLint rules passing

Documentation:
- [ ] JSDoc on public APIs
- [ ] Retry policy documented
- [ ] Metrics documented
- [ ] Error scenarios documented

Testing:
- [ ] 95%+ code coverage
- [ ] All retry scenarios tested
- [ ] Jitter verified statistically
- [ ] Metrics verified

---

## Related Files

```
src/
├── auth/
│   ├── TokenRefresher.ts    # Main refresher class
│   ├── retryPolicy.ts       # Retry configuration + jitter
│   └── types.ts             # OAuth types
└── telemetry/
    └── MetricsCollector.ts  # Metrics instrumentation

tests/
└── auth/
    ├── TokenRefresher.test.ts  # Refresh + retry tests
    └── retryPolicy.test.ts     # Jitter tests
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/04-token-refresher

# Work through 10 TDD commits
git push -u origin feat/04-token-refresher
gh pr create --title "feat: token refresher with retry policy" \
  --body "Implements GH-04: Token Refresher (closes #6)"
```

---

## Estimated Effort

**Time**: 7-9 hours
**Complexity**: Medium-High
**Risk**: Medium (retry logic can be tricky)

**Breakdown**:
- Basic refresh: 1.5 hours
- Retry logic: 2.5 hours
- Jitter: 1.5 hours
- Metrics: 2 hours
- Integration tests: 1 hour

**Dependencies**: GH-00 (bootstrap), GH-03 (TokenData model)
