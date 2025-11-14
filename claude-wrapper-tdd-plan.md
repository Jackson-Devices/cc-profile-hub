# Claude Wrapper - TDD Implementation Plan

## Development Methodology

### Test-Driven Development (TDD) Cycle
1. **Red**: Write a failing test
2. **Green**: Write minimal code to pass
3. **Refactor**: Improve code while keeping tests green
4. **Commit**: Atomic commit with clear message

### Atomic Commit Strategy
- Each commit does ONE thing
- All tests pass after each commit  
- Commit message format: `type(scope): description`
- Types: `feat`, `fix`, `test`, `refactor`, `docs`, `chore`

## Implementation Phases

## Phase 1: Core Infrastructure (Day 1-2)

### Commit 1: Project Setup
```bash
git commit -m "chore: initialize npm project with TypeScript"
```
**Files**:
- `package.json`
- `tsconfig.json`
- `.gitignore`
- `jest.config.js`

### Commit 2: Basic Process Wrapper Test
```bash
git commit -m "test(wrapper): add test for basic process wrapping"
```
**Test** (`tests/wrapper.test.ts`):
```typescript
describe('ClaudeWrapper', () => {
  it('should pass through command arguments', async () => {
    const wrapper = new ClaudeWrapper();
    const result = await wrapper.run(['--version']);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('claude');
  });
});
```

### Commit 3: Implement Basic Wrapper
```bash
git commit -m "feat(wrapper): implement basic process wrapping"
```
**Implementation** (`src/wrapper.ts`):
```typescript
export class ClaudeWrapper {
  async run(args: string[]): Promise<ProcessResult> {
    // Minimal implementation
  }
}
```

### Commit 4: Add Token Data Model Test
```bash
git commit -m "test(auth): add token data model tests"
```
**Test** (`tests/auth/token.test.ts`):
```typescript
describe('Token', () => {
  it('should detect expired token', () => {
    const token = new Token({
      accessToken: 'test',
      expiresAt: Date.now() - 1000
    });
    expect(token.isExpired()).toBe(true);
  });
  
  it('should detect valid token', () => {
    const token = new Token({
      accessToken: 'test',
      expiresAt: Date.now() + 3600000
    });
    expect(token.isExpired()).toBe(false);
  });
});
```

### Commit 5: Implement Token Model
```bash
git commit -m "feat(auth): implement token data model"
```
**Implementation** (`src/auth/token.ts`):
```typescript
export class Token {
  constructor(private data: TokenData) {}
  
  isExpired(): boolean {
    return this.data.expiresAt < Date.now();
  }
}
```

## Phase 2: Authentication Management (Day 3-4)

### Commit 6: Test Credentials File Reading
```bash
git commit -m "test(auth): add credentials file reading test"
```
**Test** (`tests/auth/credentials.test.ts`):
```typescript
describe('CredentialsManager', () => {
  it('should read credentials from file', async () => {
    const manager = new CredentialsManager('/test/path');
    const creds = await manager.read();
    expect(creds).toHaveProperty('claudeAiOauth');
  });
});
```

### Commit 7: Implement Credentials Reading
```bash
git commit -m "feat(auth): implement credentials file reading"
```

### Commit 8: Test Token Refresh Logic
```bash
git commit -m "test(auth): add token refresh logic test"
```
**Test** (`tests/auth/refresher.test.ts`):
```typescript
describe('TokenRefresher', () => {
  it('should refresh expired token', async () => {
    const mockHttp = new MockHttpClient();
    mockHttp.onPost('/oauth/token').reply(200, {
      access_token: 'new-token',
      expires_in: 3600
    });
    
    const refresher = new TokenRefresher(mockHttp);
    const newToken = await refresher.refresh('old-refresh-token');
    
    expect(newToken.accessToken).toBe('new-token');
  });
});
```

### Commit 9: Implement Token Refresh
```bash
git commit -m "feat(auth): implement OAuth token refresh"
```

### Commit 10: Test Auto-Refresh Strategy
```bash
git commit -m "test(auth): add auto-refresh strategy test"
```

### Commit 11: Implement Auto-Refresh
```bash
git commit -m "feat(auth): implement automatic token refresh"
```

## Phase 3: Profile Management (Day 5-6)

### Commit 12: Test Profile Storage
```bash
git commit -m "test(profiles): add profile storage test"
```
**Test** (`tests/profiles/storage.test.ts`):
```typescript
describe('ProfileStorage', () => {
  it('should save and load profile', async () => {
    const storage = new ProfileStorage('/test/dir');
    const profile = { id: 'test', nickname: 'Test' };
    
    await storage.save(profile);
    const loaded = await storage.load('test');
    
    expect(loaded).toEqual(profile);
  });
});
```

### Commit 13: Implement Profile Storage
```bash
git commit -m "feat(profiles): implement profile storage"
```

### Commit 14: Test Profile Switching
```bash
git commit -m "test(profiles): add profile switching test"
```

### Commit 15: Implement Profile Switching
```bash
git commit -m "feat(profiles): implement profile switching"
```

### Commit 16: Test Profile Manager
```bash
git commit -m "test(profiles): add profile manager integration test"
```

### Commit 17: Implement Profile Manager
```bash
git commit -m "feat(profiles): implement complete profile manager"
```

## Phase 4: Platform Adapters (Day 7-8)

### Commit 18: Test Platform Detection
```bash
git commit -m "test(platform): add platform detection test"
```
**Test** (`tests/platform/detector.test.ts`):
```typescript
describe('PlatformDetector', () => {
  it('should detect current platform', () => {
    const platform = PlatformDetector.detect();
    expect(['windows', 'macos', 'linux', 'wsl']).toContain(platform);
  });
});
```

### Commit 19: Implement Platform Detection
```bash
git commit -m "feat(platform): implement platform detection"
```

### Commit 20: Test Windows Adapter
```bash
git commit -m "test(platform): add Windows adapter test"
```

### Commit 21: Implement Windows Adapter
```bash
git commit -m "feat(platform): implement Windows platform adapter"
```

### Commit 22: Test macOS Adapter
```bash
git commit -m "test(platform): add macOS adapter test"
```

### Commit 23: Implement macOS Adapter
```bash
git commit -m "feat(platform): implement macOS platform adapter"
```

### Commit 24: Test Linux Adapter
```bash
git commit -m "test(platform): add Linux adapter test"
```

### Commit 25: Implement Linux Adapter
```bash
git commit -m "feat(platform): implement Linux platform adapter"
```

## Phase 5: CLI Interface (Day 9-10)

### Commit 26: Test CLI Command Parser
```bash
git commit -m "test(cli): add command parser test"
```

### Commit 27: Implement CLI Parser
```bash
git commit -m "feat(cli): implement command line parser"
```

### Commit 28: Test Auth Commands
```bash
git commit -m "test(cli): add auth command tests"
```

### Commit 29: Implement Auth Commands
```bash
git commit -m "feat(cli): implement auth management commands"
```

### Commit 30: Test Config Commands
```bash
git commit -m "test(cli): add config command tests"
```

### Commit 31: Implement Config Commands
```bash
git commit -m "feat(cli): implement configuration commands"
```

## Phase 6: Integration & Polish (Day 11-12)

### Commit 32: Integration Tests
```bash
git commit -m "test(integration): add end-to-end integration tests"
```

### Commit 33: Error Handling
```bash
git commit -m "feat(error): implement comprehensive error handling"
```

### Commit 34: Logging System
```bash
git commit -m "feat(logging): add configurable logging system"
```

### Commit 35: Installation Script
```bash
git commit -m "feat(install): add cross-platform installation script"
```

### Commit 36: Documentation
```bash
git commit -m "docs: add comprehensive README and API docs"
```

## Test Suite Structure

```
tests/
├── unit/
│   ├── auth/
│   │   ├── token.test.ts
│   │   ├── credentials.test.ts
│   │   └── refresher.test.ts
│   ├── profiles/
│   │   ├── storage.test.ts
│   │   └── manager.test.ts
│   ├── platform/
│   │   ├── detector.test.ts
│   │   └── adapters.test.ts
│   └── wrapper/
│       └── wrapper.test.ts
├── integration/
│   ├── auth-flow.test.ts
│   ├── profile-switch.test.ts
│   └── token-refresh.test.ts
├── e2e/
│   ├── full-workflow.test.ts
│   └── long-running.test.ts
└── fixtures/
    ├── credentials.json
    ├── expired-token.json
    └── profiles.json
```

## Testing Utilities

### Mock HTTP Client
```typescript
class MockHttpClient {
  private handlers = new Map();
  
  onPost(url: string) {
    return {
      reply: (status: number, data: any) => {
        this.handlers.set(url, { status, data });
      }
    };
  }
  
  async post(url: string, data: any) {
    const handler = this.handlers.get(url);
    if (!handler) throw new Error(`No handler for ${url}`);
    return { status: handler.status, data: handler.data };
  }
}
```

### Mock File System
```typescript
class MockFileSystem {
  private files = new Map<string, string>();
  
  async readFile(path: string): Promise<string> {
    if (!this.files.has(path)) {
      throw new Error(`File not found: ${path}`);
    }
    return this.files.get(path)!;
  }
  
  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }
}
```

### Test Fixtures Factory
```typescript
class TestFixtures {
  static createExpiredToken(): TokenData {
    return {
      accessToken: 'expired-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 1000,
      scopes: ['user:inference']
    };
  }
  
  static createValidToken(): TokenData {
    return {
      accessToken: 'valid-token',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() + 3600000,
      scopes: ['user:inference']
    };
  }
  
  static createProfile(id: string): Profile {
    return {
      id,
      nickname: `Test ${id}`,
      credentialsPath: `/test/${id}/credentials.json`,
      metadata: {
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      }
    };
  }
}
```

## Coverage Requirements

- **Unit Tests**: 90% coverage minimum
- **Integration Tests**: All critical paths
- **E2E Tests**: Main user workflows
- **Platform Tests**: Each supported platform

## CI/CD Pipeline

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        node: [18, 20]
    
    runs-on: ${{ matrix.os }}
    
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node }}
      
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:e2e
      - run: npm run coverage
      
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## Development Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "jest tests/e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "build": "tsc",
    "dev": "ts-node-dev src/index.ts",
    "lint": "eslint src tests",
    "format": "prettier --write .",
    "precommit": "npm run lint && npm test",
    "release": "standard-version"
  }
}
```

## Key Testing Principles

1. **Test Behavior, Not Implementation**: Focus on what the code does, not how
2. **Arrange-Act-Assert**: Clear test structure
3. **One Assertion Per Test**: Keep tests focused
4. **Descriptive Names**: Test names should explain the scenario
5. **Fast Tests**: Mock external dependencies
6. **Deterministic**: Tests should always produce same results
7. **Independent**: Tests should not depend on each other
8. **Complete**: Test happy path, edge cases, and error conditions

## Example Test Pattern

```typescript
describe('Component', () => {
  let component: Component;
  let mockDependency: MockDependency;
  
  beforeEach(() => {
    // Arrange
    mockDependency = new MockDependency();
    component = new Component(mockDependency);
  });
  
  describe('when condition is met', () => {
    it('should produce expected result', async () => {
      // Arrange
      const input = 'test-input';
      mockDependency.setup(x => x.method()).returns('mocked');
      
      // Act
      const result = await component.process(input);
      
      // Assert
      expect(result).toBe('expected-output');
      expect(mockDependency.method).toHaveBeenCalledWith(input);
    });
    
    it('should handle error gracefully', async () => {
      // Arrange
      mockDependency.setup(x => x.method()).throws(new Error('test'));
      
      // Act & Assert
      await expect(component.process('input')).rejects.toThrow('test');
    });
  });
});
```

## Success Criteria

- [ ] All tests pass on all platforms
- [ ] 90%+ code coverage
- [ ] No flaky tests
- [ ] CI/CD pipeline green
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Code review approved

This TDD approach ensures robust, well-tested code with clear atomic commits that can be easily reviewed and understood.
