# GH-08: Integration/E2E Harness & Docs

**Parent**: #1 (Project Blueprint)
**Depends On**: #3 (GH-01), #5 (GH-03), #6 (GH-04), #7 (GH-05), #8 (GH-06), #9 (GH-07)
**Unblocks**: Nothing (final integration)
**External Dependencies**: None (uses all previous components)

---

## Overview

Implements comprehensive integration and end-to-end testing infrastructure. Creates test harnesses, fixture binaries, and validates complete user workflows. Updates documentation with architecture diagrams and usage examples.

**Key Features**:
- Integration test harness with component orchestration
- Fixture Claude binary for E2E tests
- Multi-profile workflow tests
- Background refresh long-running tests
- Token lifecycle tests
- Error recovery scenarios
- Complete documentation with diagrams

---

## TDD Workflow (10 Atomic Commits)

### Commit 1: Integration Harness Test (RED)
**Message**: `test(integration): add integration test harness`

**Files Changed**:
- `tests/integration/IntegrationHarness.test.ts` (new)

**Code**:
```typescript
import { IntegrationHarness } from './IntegrationHarness';
import { join } from 'path';
import { tmpdir } from 'os';

describe('IntegrationHarness', () => {
  let harness: IntegrationHarness;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `integration-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should initialize all components', async () => {
    await harness.setup();

    expect(harness.config).toBeDefined();
    expect(harness.tokenStore).toBeDefined();
    expect(harness.profileManager).toBeDefined();
    expect(harness.authManager).toBeDefined();
  });

  it('should create test profile', async () => {
    await harness.setup();

    const profile = await harness.createTestProfile({
      nickname: 'Test',
      email: 'test@example.com'
    });

    expect(profile.id).toBeTruthy();
    expect(profile.nickname).toBe('Test');
  });

  it('should inject test token for profile', async () => {
    await harness.setup();

    const profile = await harness.createTestProfile({
      nickname: 'Test',
      email: 'test@example.com'
    });

    await harness.injectToken(profile.id, {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000
    });

    const token = await harness.tokenStore.read(profile.id);
    expect(token?.accessToken).toBe('test-access');
  });

  it('should cleanup resources', async () => {
    await harness.setup();
    await harness.createTestProfile({ nickname: 'Test', email: 'test@example.com' });

    await harness.cleanup();

    // Verify cleanup (directory should be empty or removed)
    expect(harness['cleaned']).toBe(true);
  });
});
```

**Expected Result**: ❌ RED - IntegrationHarness doesn't exist

---

### Commit 2: Integration Harness Implementation (GREEN)
**Message**: `feat(integration): implement integration test harness`

**Files Changed**:
- `tests/integration/IntegrationHarness.ts` (new)

**Code**:
```typescript
// tests/integration/IntegrationHarness.ts
import { Config } from '../../src/config/Config';
import { TokenStore } from '../../src/auth/TokenStore';
import { TokenRefresher } from '../../src/auth/TokenRefresher';
import { AuthManager } from '../../src/auth/AuthManager';
import { ProfileManager } from '../../src/profiles/ProfileManager';
import { TokenData } from '../../src/auth/TokenData';
import { ProfileRecord } from '../../src/profiles/types';
import { mkdir, rm } from 'fs/promises';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

export interface TestProfileInput {
  nickname: string;
  email: string;
}

export class IntegrationHarness {
  config!: Config;
  tokenStore!: TokenStore;
  tokenRefresher!: TokenRefresher;
  profileManager!: ProfileManager;
  authManager!: AuthManager;
  mockHttp!: MockAdapter;

  private cleaned = false;

  constructor(private testDir: string) {}

  async setup(): Promise<void> {
    // Create test directory
    await mkdir(this.testDir, { recursive: true });

    // Initialize components
    const httpClient = axios.create();
    this.mockHttp = new MockAdapter(httpClient);

    this.config = new Config({
      claudePath: '/usr/local/bin/claude',
      oauth: {
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id',
        scopes: ['user:inference']
      },
      logging: {
        level: 'error',
        redactTokens: true
      },
      refreshThreshold: 300
    });

    this.tokenStore = new TokenStore(this.testDir);

    this.tokenRefresher = new TokenRefresher({
      httpClient,
      tokenUrl: this.config.oauth.tokenUrl,
      clientId: this.config.oauth.clientId
    });

    this.profileManager = new ProfileManager(this.testDir, {
      tokenStore: this.tokenStore
    });

    // AuthManager will be created per-profile
  }

  async createTestProfile(input: TestProfileInput): Promise<ProfileRecord> {
    return this.profileManager.create({
      nickname: input.nickname,
      email: input.email,
      storageBackend: 'file',
      metadata: { test: 'true' }
    });
  }

  async injectToken(profileId: string, tokenData: Partial<TokenData>): Promise<void> {
    const fullToken: TokenData = {
      accessToken: tokenData.accessToken || 'test-access',
      refreshToken: tokenData.refreshToken || 'test-refresh',
      expiresAt: tokenData.expiresAt || Date.now() + 3600000,
      grantedAt: tokenData.grantedAt || Date.now(),
      scopes: tokenData.scopes || ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: tokenData.deviceFingerprint || 'test-device'
    };

    await this.tokenStore.write(profileId, fullToken);
  }

  createAuthManager(profileId: string): AuthManager {
    return new AuthManager({
      store: this.tokenStore,
      refresher: this.tokenRefresher,
      profileId,
      refreshThreshold: this.config.refreshThreshold
    });
  }

  async cleanup(): Promise<void> {
    if (this.cleaned) return;

    // Remove test directory
    await rm(this.testDir, { recursive: true, force: true });

    this.cleaned = true;
  }
}
```

**Expected Result**: ✅ GREEN - Harness tests pass

---

### Commit 3: Fixture Binary Test (RED)
**Message**: `test(e2e): add fixture binary for E2E tests`

**Files Changed**:
- `tests/e2e/FixtureBinary.test.ts` (new)

**Code**:
```typescript
import { FixtureBinary } from './FixtureBinary';
import { spawn } from 'child_process';

describe('FixtureBinary', () => {
  let fixtureBinary: FixtureBinary;

  beforeEach(() => {
    fixtureBinary = new FixtureBinary();
  });

  it('should create executable fixture', async () => {
    const binaryPath = await fixtureBinary.create();

    expect(binaryPath).toBeTruthy();
    expect(binaryPath).toContain('claude-fixture');
  });

  it('should execute and return version', (done) => {
    fixtureBinary.create().then(binaryPath => {
      const child = spawn(binaryPath, ['--version']);

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', (code) => {
        expect(code).toBe(0);
        expect(output).toContain('claude-fixture');
        done();
      });
    });
  });

  it('should echo environment variables', (done) => {
    fixtureBinary.create().then(binaryPath => {
      const child = spawn(binaryPath, ['env-check'], {
        env: {
          ...process.env,
          CLAUDE_OAUTH_TOKEN: 'test-token-123'
        }
      });

      let output = '';
      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.on('close', () => {
        expect(output).toContain('CLAUDE_OAUTH_TOKEN=test-token-123');
        done();
      });
    });
  });

  it('should cleanup fixture binary', async () => {
    const binaryPath = await fixtureBinary.create();
    await fixtureBinary.cleanup();

    // Binary should be removed
    expect(fixtureBinary['cleaned']).toBe(true);
  });
});
```

**Expected Result**: ❌ RED - FixtureBinary doesn't exist

---

### Commit 4: Fixture Binary Implementation (GREEN)
**Message**: `feat(e2e): implement fixture Claude binary`

**Files Changed**:
- `tests/e2e/FixtureBinary.ts` (new)
- `tests/e2e/claude-fixture.js` (new)

**Code**:
```typescript
// tests/e2e/FixtureBinary.ts
import { writeFile, chmod, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

export class FixtureBinary {
  private binaryPath: string | null = null;
  private cleaned = false;

  async create(): Promise<string> {
    const fixtureScript = `#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.includes('--version')) {
  console.log('claude-fixture version 1.0.0');
  process.exit(0);
}

if (args.includes('env-check')) {
  console.log('CLAUDE_OAUTH_TOKEN=' + (process.env.CLAUDE_OAUTH_TOKEN || 'NOT_SET'));
  process.exit(0);
}

// Default: echo args
console.log('Args:', args.join(' '));
process.exit(0);
`;

    this.binaryPath = join(tmpdir(), `claude-fixture-${Date.now()}`);

    await writeFile(this.binaryPath, fixtureScript, { encoding: 'utf-8' });
    await chmod(this.binaryPath, 0o755); // Make executable

    return this.binaryPath;
  }

  async cleanup(): Promise<void> {
    if (this.cleaned || !this.binaryPath) return;

    await unlink(this.binaryPath);
    this.cleaned = true;
  }
}
```

**Expected Result**: ✅ GREEN - Fixture binary tests pass

---

### Commit 5: Multi-Profile E2E Test (RED)
**Message**: `test(e2e): add multi-profile workflow test`

**Files Changed**:
- `tests/e2e/MultiProfile.test.ts` (new)

**Code**:
```typescript
import { IntegrationHarness } from '../integration/IntegrationHarness';
import { FixtureBinary } from './FixtureBinary';
import { ProcessInterceptor } from '../../src/interceptor/ProcessInterceptor';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: Multi-Profile Workflow', () => {
  let harness: IntegrationHarness;
  let fixture: FixtureBinary;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `e2e-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
    fixture = new FixtureBinary();

    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
    await fixture.cleanup();
  });

  it('should execute command with profile 1 token', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Profile1',
      email: 'p1@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'profile1-token',
      expiresAt: Date.now() + 3600000
    });

    await harness.profileManager.activate(profile1.id);

    const authManager = harness.createAuthManager(profile1.id);
    const token = await authManager.ensureValidToken();

    expect(token.accessToken).toBe('profile1-token');
  });

  it('should switch between profiles', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Work',
      email: 'work@example.com'
    });

    const profile2 = await harness.createTestProfile({
      nickname: 'Personal',
      email: 'personal@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'work-token',
      expiresAt: Date.now() + 3600000
    });

    await harness.injectToken(profile2.id, {
      accessToken: 'personal-token',
      expiresAt: Date.now() + 3600000
    });

    // Activate profile 1
    await harness.profileManager.activate(profile1.id);
    let active = await harness.profileManager.getActive();
    expect(active?.nickname).toBe('Work');

    // Switch to profile 2
    await harness.profileManager.activate(profile2.id);
    active = await harness.profileManager.getActive();
    expect(active?.nickname).toBe('Personal');

    // Verify correct token
    const authManager = harness.createAuthManager(profile2.id);
    const token = await authManager.ensureValidToken();
    expect(token.accessToken).toBe('personal-token');
  });

  it('should isolate tokens between profiles', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Profile1',
      email: 'p1@example.com'
    });

    const profile2 = await harness.createTestProfile({
      nickname: 'Profile2',
      email: 'p2@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'token1',
      expiresAt: Date.now() + 3600000
    });

    await harness.injectToken(profile2.id, {
      accessToken: 'token2',
      expiresAt: Date.now() + 3600000
    });

    const token1 = await harness.tokenStore.read(profile1.id);
    const token2 = await harness.tokenStore.read(profile2.id);

    expect(token1?.accessToken).toBe('token1');
    expect(token2?.accessToken).toBe('token2');
  });
});
```

**Expected Result**: ❌ RED - E2E test infrastructure incomplete

---

### Commit 6: Multi-Profile E2E Implementation (GREEN)
**Message**: `feat(e2e): complete multi-profile E2E tests`

**Files Changed**:
- Update IntegrationHarness if needed
- Verify all components work together

**Code**:
```typescript
// No new implementation needed - tests should pass
// This commit verifies the integration works
```

**Expected Result**: ✅ GREEN - Multi-profile E2E tests pass

---

### Commit 7: Background Refresh Test (RED)
**Message**: `test(e2e): add background refresh long-running test`

**Files Changed**:
- `tests/e2e/BackgroundRefresh.test.ts` (new)

**Code**:
```typescript
import { IntegrationHarness } from '../integration/IntegrationHarness';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: Background Refresh', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    const testDir = join(tmpdir(), `bg-refresh-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
    await harness.setup();

    jest.useFakeTimers();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await harness.cleanup();
  });

  it('should refresh token in background when approaching expiry', async () => {
    const profile = await harness.createTestProfile({
      nickname: 'AutoRefresh',
      email: 'auto@example.com'
    });

    // Inject token expiring soon (below threshold)
    await harness.injectToken(profile.id, {
      accessToken: 'old-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 200000 // 200 seconds (below 300s threshold)
    });

    // Mock successful refresh
    harness.mockHttp.onPost().reply(200, {
      access_token: 'refreshed-token',
      refresh_token: 'new-refresh',
      expires_in: 3600,
      token_type: 'Bearer',
      scope: 'user:inference'
    });

    const authManager = harness.createAuthManager(profile.id);
    authManager.startBackgroundRefresh(60000); // Check every 60s

    // Advance time by 60 seconds
    jest.advanceTimersByTime(60000);

    // Wait for async refresh
    await Promise.resolve();
    await Promise.resolve();

    // Verify token was refreshed
    const token = await harness.tokenStore.read(profile.id);
    expect(token?.accessToken).toBe('refreshed-token');

    authManager.dispose();
  });

  it('should not refresh when token still valid', async () => {
    const profile = await harness.createTestProfile({
      nickname: 'StillValid',
      email: 'valid@example.com'
    });

    await harness.injectToken(profile.id, {
      accessToken: 'valid-token',
      expiresAt: Date.now() + 7200000 // 2 hours (well above threshold)
    });

    const authManager = harness.createAuthManager(profile.id);
    authManager.startBackgroundRefresh(60000);

    jest.advanceTimersByTime(60000);
    await Promise.resolve();

    // No refresh should have happened
    expect(harness.mockHttp.history.post).toHaveLength(0);

    authManager.dispose();
  });
});
```

**Expected Result**: ❌ RED - Background refresh may need fixes

---

### Commit 8: Background Refresh Verification (GREEN)
**Message**: `feat(e2e): verify background refresh works`

**Files Changed**:
- Fix any timing or async issues in AuthManager

**Code**:
```typescript
// Verify background refresh implementation
// Add any necessary delays or promise handling
```

**Expected Result**: ✅ GREEN - Background refresh tests pass

---

### Commit 9: Error Recovery Test (RED)
**Message**: `test(e2e): add error recovery scenarios`

**Files Changed**:
- `tests/e2e/ErrorRecovery.test.ts` (new)

**Code**:
```typescript
import { IntegrationHarness } from '../integration/IntegrationHarness';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: Error Recovery', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    const testDir = join(tmpdir(), `error-recovery-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should recover from corrupted token file', async () => {
    const profile = await harness.createTestProfile({
      nickname: 'Corrupted',
      email: 'corrupt@example.com'
    });

    // Write corrupted token data
    const { writeFile } = await import('fs/promises');
    const tokenPath = join(harness['testDir'], `${profile.id}.token.json`);
    await writeFile(tokenPath, 'corrupted data {');

    // Should return null and allow re-authentication
    const token = await harness.tokenStore.read(profile.id);
    expect(token).toBeNull();

    // Can write new valid token
    await harness.injectToken(profile.id, {
      accessToken: 'recovered-token',
      expiresAt: Date.now() + 3600000
    });

    const recovered = await harness.tokenStore.read(profile.id);
    expect(recovered?.accessToken).toBe('recovered-token');
  });

  it('should handle refresh failure gracefully', async () => {
    const profile = await harness.createTestProfile({
      nickname: 'RefreshFail',
      email: 'fail@example.com'
    });

    await harness.injectToken(profile.id, {
      accessToken: 'expired-token',
      refreshToken: 'bad-refresh',
      expiresAt: Date.now() - 1000 // Expired
    });

    // Mock refresh failure
    harness.mockHttp.onPost().reply(401, {
      error: 'invalid_grant'
    });

    const authManager = harness.createAuthManager(profile.id);

    await expect(
      authManager.ensureValidToken()
    ).rejects.toThrow(/invalid_grant/);
  });

  it('should recover from network errors with retry', async () => {
    const profile = await harness.createTestProfile({
      nickname: 'NetworkError',
      email: 'network@example.com'
    });

    await harness.injectToken(profile.id, {
      accessToken: 'expired',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000
    });

    let attempts = 0;
    harness.mockHttp.onPost().reply(() => {
      attempts++;
      if (attempts < 3) {
        return [500, { error: 'internal_error' }];
      }
      return [200, {
        access_token: 'recovered-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'user:inference'
      }];
    });

    const authManager = harness.createAuthManager(profile.id);
    const token = await authManager.ensureValidToken();

    expect(token.accessToken).toBe('recovered-token');
    expect(attempts).toBe(3); // Succeeded after 2 retries
  });
});
```

**Expected Result**: ❌ RED - Some error scenarios may not be handled

---

### Commit 10: Error Recovery Implementation (GREEN)
**Message**: `feat(e2e): complete error recovery tests`

**Files Changed**:
- Verify error handling in all components

**Code**:
```typescript
// Ensure all components handle errors gracefully
// Verify retry logic works as expected
```

**Expected Result**: ✅ GREEN - Error recovery tests pass

---

## Acceptance Criteria

Integration Harness:
- [ ] Initializes all components
- [ ] Creates test profiles
- [ ] Injects test tokens
- [ ] Cleans up resources
- [ ] Mocks HTTP requests
- [ ] Creates AuthManager instances

Fixture Binary:
- [ ] Creates executable fixture
- [ ] Responds to --version
- [ ] Echoes environment variables
- [ ] Accepts CLI arguments
- [ ] Cleans up after tests

Multi-Profile E2E:
- [ ] Execute with profile 1 token
- [ ] Execute with profile 2 token
- [ ] Switch between profiles
- [ ] Isolate tokens per profile
- [ ] Verify active profile

Background Refresh:
- [ ] Refreshes token approaching expiry
- [ ] Skips refresh when token valid
- [ ] Runs periodically (60s interval)
- [ ] Stops on dispose
- [ ] Handles refresh failures

Error Recovery:
- [ ] Recovers from corrupted token file
- [ ] Handles refresh failures
- [ ] Retries on network errors
- [ ] Recovers from transient errors
- [ ] Provides clear error messages

Documentation:
- [ ] Architecture diagram
- [ ] Component interaction diagram
- [ ] Usage examples
- [ ] API documentation
- [ ] Troubleshooting guide

---

## Testing Strategy

### Integration Tests
```typescript
// Component Integration
- Config → Logger
- TokenStore → CryptoProvider
- TokenRefresher → Retry Policy
- AuthManager → Store + Refresher
- ProfileManager → TokenStore

// Cross-Component
- Full token lifecycle
- Profile switch workflow
- Background refresh flow
```

### E2E Tests
```typescript
// User Workflows
- Initial setup
- Add profiles
- Switch profiles
- Execute commands
- Background refresh

// Long-Running
- 24-hour background refresh
- Token rotation over time
- Concurrent command execution

// Error Scenarios
- Network failures
- Corrupted files
- Invalid tokens
- Missing profiles
```

---

## Success Metrics

- **Test Coverage**: Overall ≥90%
- **Integration Tests**: All critical paths
- **E2E Tests**: All user workflows
- **Documentation**: Complete and up-to-date
- **CI/CD**: Green on all platforms

---

## Downstream Impact

**Unblocks**:
- Nothing (final integration)

**Provides**:
- Complete test suite
- E2E confidence
- Documentation
- Ready for production

---

## Definition of Done

Development:
- [ ] All 10 commits completed following TDD
- [ ] All integration tests passing
- [ ] All E2E tests passing
- [ ] Code reviewed and approved

Documentation:
- [ ] Architecture diagram created
- [ ] API docs complete
- [ ] Usage guide written
- [ ] Troubleshooting guide added
- [ ] README comprehensive

Testing:
- [ ] 90%+ overall coverage
- [ ] All workflows tested
- [ ] Long-running tests pass
- [ ] Error scenarios covered

CI/CD:
- [ ] Tests pass on Linux
- [ ] Tests pass on Windows
- [ ] Tests pass on macOS
- [ ] No flaky tests

Release:
- [ ] Version tagged
- [ ] Changelog updated
- [ ] Release notes written

---

## Related Files

```
tests/
├── integration/
│   ├── IntegrationHarness.ts     # Test harness
│   ├── TokenLifecycle.test.ts    # Token workflow
│   ├── ProfileWorkflow.test.ts   # Profile workflow
│   └── AuthFlow.test.ts          # Auth flow
├── e2e/
│   ├── FixtureBinary.ts          # Fixture binary
│   ├── MultiProfile.test.ts      # Multi-profile E2E
│   ├── BackgroundRefresh.test.ts # Background refresh
│   ├── ErrorRecovery.test.ts     # Error scenarios
│   └── LongRunning.test.ts       # Long-running tests
└── fixtures/
    ├── config.yml                # Test config
    └── claude-fixture.js         # Fixture script

docs/
├── architecture.md               # Architecture overview
├── api.md                        # API documentation
├── usage.md                      # Usage guide
├── troubleshooting.md            # Troubleshooting
└── diagrams/
    ├── component-interaction.png # Component diagram
    └── token-lifecycle.png       # Token flow diagram
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/08-integration

# Work through 10 TDD commits
git push -u origin feat/08-integration
gh pr create --title "feat: integration tests and docs" \
  --body "Implements GH-08: Integration/E2E (closes #10)"
```

---

## Estimated Effort

**Time**: 12-14 hours
**Complexity**: High
**Risk**: Low (verification only)

**Breakdown**:
- Integration harness: 2 hours
- Fixture binary: 1.5 hours
- Multi-profile E2E: 2 hours
- Background refresh: 2 hours
- Error recovery: 2 hours
- Long-running tests: 1.5 hours
- Documentation: 3 hours
- Diagrams: 1 hour

**Dependencies**: All previous issues (GH-00 through GH-07)

---

## Documentation Deliverables

### 1. Architecture Diagram
```
┌─────────────────────────────────────────────────┐
│                  CLI Interface                   │
│  (commander, ProfileCLI, Commands)              │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│            ProcessInterceptor                    │
│  (Wraps claude-original, injects token)         │
└───────────────┬─────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────┐
│             AuthManager                          │
│  (ensureValidToken, background refresh)         │
└─────┬───────────────────────┬───────────────────┘
      │                       │
┌─────▼─────────┐      ┌──────▼──────────┐
│  TokenStore   │      │ TokenRefresher  │
│  (read/write) │      │ (OAuth refresh) │
└─────┬─────────┘      └──────┬──────────┘
      │                       │
┌─────▼───────────────────────▼──────────┐
│         PlatformAdapter                 │
│  (paths, secure storage, capabilities) │
└────────────────────────────────────────┘
```

### 2. Token Lifecycle Diagram
```
User runs command
  → ProcessInterceptor
    → AuthManager.ensureValidToken()
      → Check cache
        → If valid: return cached token
        → If expired/missing:
          → Load from TokenStore
          → Check expiry threshold
            → If refresh needed:
              → TokenRefresher.refresh()
              → TokenStore.write()
              → Update cache
            → Return token
      → Inject token into environment
      → Spawn claude-original
```

### 3. Usage Examples

#### Add Profile
```bash
claude-wrapper profile add \
  --nickname "Work" \
  --email "work@example.com" \
  --storage os-store
```

#### List Profiles
```bash
claude-wrapper profile list
# or JSON output
claude-wrapper profile list --json
```

#### Switch Profile
```bash
claude-wrapper profile switch <profile-id>
```

#### Execute Command (Transparent)
```bash
claude chat "Hello, Claude!"
# Wrapper auto-injects token for active profile
```

---

## Post-Integration Checklist

Performance:
- [ ] Wrapper overhead < 100ms
- [ ] Background refresh < 500ms
- [ ] Token validation < 10ms

Security:
- [ ] Tokens never logged
- [ ] Encrypted file fallback works
- [ ] Audit log captures events

Reliability:
- [ ] 99.9% refresh success rate
- [ ] Graceful error handling
- [ ] No orphan processes

UX:
- [ ] Clear error messages
- [ ] Helpful CLI output
- [ ] JSON mode for automation

Cross-Platform:
- [ ] Works on Windows
- [ ] Works on macOS
- [ ] Works on Linux
- [ ] Works on WSL
