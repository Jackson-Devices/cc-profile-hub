# GH-02: Config Loader + Logging

**Parent**: #1 (Project Blueprint)
**Depends On**: #2 (GH-00 Foundation)
**Unblocks**: #5 (GH-03 Token Store), #8 (GH-06 Profile Manager)
**External Dependencies**: `js-yaml`, `zod`, `pino`

---

## Overview

Implements configuration management and structured logging infrastructure. Config loader reads YAML files, merges environment overrides, and validates schema using Zod. Logger provides structured JSON logging with automatic token redaction to prevent credential leakage.

**Key Features**:
- YAML config loading with environment variable overrides
- Zod schema validation with typed errors
- Structured logger with context propagation
- Automatic token/secret redaction in logs
- Hot-reload capability with file watching (optional)

---

## TDD Workflow (10 Atomic Commits)

### Commit 1: Config Schema Test (RED)
**Message**: `test(config): add schema validation tests`

**Files Changed**:
- `tests/config/Config.test.ts` (new)

**Code**:
```typescript
import { Config } from '../../src/config/Config';
import { z } from 'zod';

describe('Config Schema', () => {
  it('should validate minimal valid config', () => {
    const input = {
      claudePath: '/usr/local/bin/claude-original',
      oauth: {
        tokenUrl: 'https://api.anthropic.com/oauth/token',
        clientId: 'test-client-id'
      }
    };

    expect(() => Config.validate(input)).not.toThrow();
  });

  it('should reject invalid config', () => {
    const input = { invalid: true };

    expect(() => Config.validate(input)).toThrow();
  });

  it('should reject missing required fields', () => {
    const input = { claudePath: '/bin/claude' };

    expect(() => Config.validate(input)).toThrow(/oauth/);
  });
});
```

**Expected Result**: ❌ RED - Config class doesn't exist yet

---

### Commit 2: Config Schema Implementation (GREEN)
**Message**: `feat(config): implement Zod config schema`

**Files Changed**:
- `src/config/Config.ts` (new)
- `src/config/types.ts` (new)

**Code**:
```typescript
// src/config/types.ts
import { z } from 'zod';

export const ConfigSchema = z.object({
  claudePath: z.string().min(1),
  oauth: z.object({
    tokenUrl: z.string().url(),
    clientId: z.string().min(1),
    scopes: z.array(z.string()).optional().default(['user:inference'])
  }),
  logging: z.object({
    level: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
    redactTokens: z.boolean().default(true)
  }).optional().default({}),
  refreshThreshold: z.number().min(60).default(300) // seconds before expiry
});

export type ConfigData = z.infer<typeof ConfigSchema>;

// src/config/Config.ts
import { ConfigSchema, ConfigData } from './types';

export class Config {
  static validate(input: unknown): ConfigData {
    return ConfigSchema.parse(input);
  }

  constructor(private data: ConfigData) {}

  get claudePath(): string {
    return this.data.claudePath;
  }

  get oauth() {
    return this.data.oauth;
  }

  get logging() {
    return this.data.logging;
  }

  get refreshThreshold(): number {
    return this.data.refreshThreshold;
  }
}
```

**Expected Result**: ✅ GREEN - Schema validation tests pass

---

### Commit 3: Config Loader Test (RED)
**Message**: `test(config): add YAML file loading tests`

**Files Changed**:
- `tests/config/ConfigLoader.test.ts` (new)
- `tests/fixtures/config.yml` (new)

**Code**:
```typescript
// tests/config/ConfigLoader.test.ts
import { ConfigLoader } from '../../src/config/ConfigLoader';
import { join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';

describe('ConfigLoader', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `config-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  it('should load valid YAML config', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(configPath, `
claudePath: /usr/bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: test-client
`);

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.claudePath).toBe('/usr/bin/claude');
    expect(config.oauth.clientId).toBe('test-client');
  });

  it('should throw on missing config file', async () => {
    const loader = new ConfigLoader('/nonexistent/config.yml');

    await expect(loader.load()).rejects.toThrow(/not found/);
  });

  it('should throw on invalid YAML', async () => {
    const configPath = join(tempDir, 'bad.yml');
    writeFileSync(configPath, 'invalid: yaml: content:');

    const loader = new ConfigLoader(configPath);

    await expect(loader.load()).rejects.toThrow(/YAML/);
  });
});
```

**Expected Result**: ❌ RED - ConfigLoader doesn't exist

---

### Commit 4: Config Loader Implementation (GREEN)
**Message**: `feat(config): implement YAML config loader`

**Files Changed**:
- `src/config/ConfigLoader.ts` (new)
- `package.json` (update dependencies)

**Code**:
```typescript
// src/config/ConfigLoader.ts
import { readFile } from 'fs/promises';
import { load as parseYaml } from 'js-yaml';
import { Config } from './Config';
import { ConfigData } from './types';

export class ConfigLoader {
  constructor(private configPath: string) {}

  async load(): Promise<Config> {
    let content: string;

    try {
      content = await readFile(this.configPath, 'utf-8');
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config file not found: ${this.configPath}`);
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = parseYaml(content);
    } catch (error: any) {
      throw new Error(`Invalid YAML in config file: ${error.message}`);
    }

    const validated = Config.validate(parsed);
    return new Config(validated);
  }
}
```

**Expected Result**: ✅ GREEN - Config loading tests pass

---

### Commit 5: Env Override Test (RED)
**Message**: `test(config): add environment variable override tests`

**Files Changed**:
- `tests/config/ConfigLoader.test.ts` (update)

**Code**:
```typescript
describe('ConfigLoader Environment Overrides', () => {
  it('should override claudePath from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(configPath, `
claudePath: /default/path
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
`);

    process.env.CC_WRAPPER_CLAUDE_PATH = '/env/override/path';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.claudePath).toBe('/env/override/path');

    delete process.env.CC_WRAPPER_CLAUDE_PATH;
  });

  it('should override oauth clientId from env', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(configPath, `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: default-client
`);

    process.env.CC_WRAPPER_OAUTH_CLIENT_ID = 'env-client';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.oauth.clientId).toBe('env-client');

    delete process.env.CC_WRAPPER_OAUTH_CLIENT_ID;
  });

  it('should merge env overrides with file config', async () => {
    const configPath = join(tempDir, 'config.yml');
    writeFileSync(configPath, `
claudePath: /bin/claude
oauth:
  tokenUrl: https://api.anthropic.com/oauth/token
  clientId: file-client
refreshThreshold: 600
`);

    process.env.CC_WRAPPER_REFRESH_THRESHOLD = '120';

    const loader = new ConfigLoader(configPath);
    const config = await loader.load();

    expect(config.refreshThreshold).toBe(120);
    expect(config.oauth.clientId).toBe('file-client'); // unchanged

    delete process.env.CC_WRAPPER_REFRESH_THRESHOLD;
  });
});
```

**Expected Result**: ❌ RED - Env override not implemented

---

### Commit 6: Env Override Implementation (GREEN)
**Message**: `feat(config): implement environment variable overrides`

**Files Changed**:
- `src/config/ConfigLoader.ts` (update)
- `src/config/envOverrides.ts` (new)

**Code**:
```typescript
// src/config/envOverrides.ts
export function applyEnvOverrides(config: any): any {
  const overrides: any = { ...config };

  if (process.env.CC_WRAPPER_CLAUDE_PATH) {
    overrides.claudePath = process.env.CC_WRAPPER_CLAUDE_PATH;
  }

  if (process.env.CC_WRAPPER_OAUTH_CLIENT_ID) {
    overrides.oauth = {
      ...overrides.oauth,
      clientId: process.env.CC_WRAPPER_OAUTH_CLIENT_ID
    };
  }

  if (process.env.CC_WRAPPER_OAUTH_TOKEN_URL) {
    overrides.oauth = {
      ...overrides.oauth,
      tokenUrl: process.env.CC_WRAPPER_OAUTH_TOKEN_URL
    };
  }

  if (process.env.CC_WRAPPER_REFRESH_THRESHOLD) {
    overrides.refreshThreshold = parseInt(process.env.CC_WRAPPER_REFRESH_THRESHOLD, 10);
  }

  if (process.env.CC_WRAPPER_LOG_LEVEL) {
    overrides.logging = {
      ...overrides.logging,
      level: process.env.CC_WRAPPER_LOG_LEVEL
    };
  }

  return overrides;
}

// src/config/ConfigLoader.ts (update load method)
async load(): Promise<Config> {
  let content: string;

  try {
    content = await readFile(this.configPath, 'utf-8');
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      throw new Error(`Config file not found: ${this.configPath}`);
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(content);
  } catch (error: any) {
    throw new Error(`Invalid YAML in config file: ${error.message}`);
  }

  // Apply environment overrides
  const withOverrides = applyEnvOverrides(parsed);

  const validated = Config.validate(withOverrides);
  return new Config(validated);
}
```

**Expected Result**: ✅ GREEN - Env override tests pass

---

### Commit 7: Logger Test (RED)
**Message**: `test(logging): add structured logger tests`

**Files Changed**:
- `tests/utils/Logger.test.ts` (new)

**Code**:
```typescript
import { Logger } from '../../src/utils/Logger';

describe('Logger', () => {
  let logs: any[];
  let mockWrite: jest.SpyInstance;

  beforeEach(() => {
    logs = [];
    mockWrite = jest.spyOn(process.stdout, 'write').mockImplementation((chunk: any) => {
      logs.push(JSON.parse(chunk));
      return true;
    });
  });

  afterEach(() => {
    mockWrite.mockRestore();
  });

  it('should log structured JSON messages', () => {
    const logger = new Logger({ level: 'info' });
    logger.info('test message', { foo: 'bar' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      level: 'info',
      msg: 'test message',
      foo: 'bar'
    });
  });

  it('should create child logger with context', () => {
    const logger = new Logger({ level: 'info' });
    const child = logger.child({ component: 'auth' });

    child.info('test');

    expect(logs[0]).toMatchObject({
      component: 'auth',
      msg: 'test'
    });
  });

  it('should respect log level', () => {
    const logger = new Logger({ level: 'warn' });

    logger.debug('debug');
    logger.info('info');
    logger.warn('warn');

    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe('warn');
  });
});
```

**Expected Result**: ❌ RED - Logger doesn't exist

---

### Commit 8: Logger Implementation (GREEN)
**Message**: `feat(logging): implement structured logger with pino`

**Files Changed**:
- `src/utils/Logger.ts` (new)
- `package.json` (update dependencies)

**Code**:
```typescript
// src/utils/Logger.ts
import pino from 'pino';

export interface LoggerOptions {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';
  redactPaths?: string[];
}

export class Logger {
  private pino: pino.Logger;

  constructor(options: LoggerOptions) {
    this.pino = pino({
      level: options.level,
      redact: {
        paths: options.redactPaths || [],
        censor: '[REDACTED]'
      }
    });
  }

  child(bindings: Record<string, any>): Logger {
    const childLogger = new Logger({ level: this.pino.level as any });
    childLogger.pino = this.pino.child(bindings);
    return childLogger;
  }

  trace(msg: string, ...args: any[]): void {
    this.pino.trace(...args, msg);
  }

  debug(msg: string, ...args: any[]): void {
    this.pino.debug(...args, msg);
  }

  info(msg: string, ...args: any[]): void {
    this.pino.info(...args, msg);
  }

  warn(msg: string, ...args: any[]): void {
    this.pino.warn(...args, msg);
  }

  error(msg: string, ...args: any[]): void {
    this.pino.error(...args, msg);
  }
}
```

**Expected Result**: ✅ GREEN - Logger tests pass

---

### Commit 9: Token Redaction Test (RED)
**Message**: `test(logging): add token redaction tests`

**Files Changed**:
- `tests/utils/Logger.test.ts` (update)

**Code**:
```typescript
describe('Logger Token Redaction', () => {
  it('should redact accessToken field', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['accessToken', '*.accessToken']
    });

    logger.info('token data', { accessToken: 'secret-token-12345' });

    expect(logs[0].accessToken).toBe('[REDACTED]');
  });

  it('should redact refreshToken field', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['refreshToken', '*.refreshToken']
    });

    logger.info('refresh', { refreshToken: 'refresh-secret' });

    expect(logs[0].refreshToken).toBe('[REDACTED]');
  });

  it('should redact nested token fields', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['token.accessToken', 'token.refreshToken']
    });

    logger.info('nested', {
      token: {
        accessToken: 'secret',
        refreshToken: 'refresh',
        expiresAt: 123456
      }
    });

    expect(logs[0].token.accessToken).toBe('[REDACTED]');
    expect(logs[0].token.refreshToken).toBe('[REDACTED]');
    expect(logs[0].token.expiresAt).toBe(123456);
  });

  it('should redact authorization headers', () => {
    const logger = new Logger({
      level: 'info',
      redactPaths: ['headers.authorization', 'headers.Authorization']
    });

    logger.info('request', {
      headers: { authorization: 'Bearer secret-token' }
    });

    expect(logs[0].headers.authorization).toBe('[REDACTED]');
  });
});
```

**Expected Result**: ❌ RED - Redaction paths not configured

---

### Commit 10: Token Redaction Implementation (GREEN)
**Message**: `feat(logging): add automatic token redaction`

**Files Changed**:
- `src/utils/Logger.ts` (update)
- `src/utils/redactionPaths.ts` (new)

**Code**:
```typescript
// src/utils/redactionPaths.ts
export const DEFAULT_REDACTION_PATHS = [
  'accessToken',
  'refreshToken',
  'token.accessToken',
  'token.refreshToken',
  '*.accessToken',
  '*.refreshToken',
  'headers.authorization',
  'headers.Authorization',
  'password',
  'secret',
  'apiKey',
  'clientSecret'
];

// src/utils/Logger.ts (update constructor)
constructor(options: LoggerOptions) {
  const redactPaths = options.redactPaths || DEFAULT_REDACTION_PATHS;

  this.pino = pino({
    level: options.level,
    redact: {
      paths: redactPaths,
      censor: '[REDACTED]'
    }
  });
}
```

**Expected Result**: ✅ GREEN - All redaction tests pass

---

## Acceptance Criteria

Configuration:
- [ ] Loads YAML config files from specified path
- [ ] Validates config schema using Zod
- [ ] Throws typed errors for invalid config
- [ ] Supports all required fields (claudePath, oauth)
- [ ] Supports optional fields with defaults
- [ ] Applies environment variable overrides
- [ ] Env vars follow CC_WRAPPER_* naming convention
- [ ] Merges env overrides with file config correctly
- [ ] Handles missing config file gracefully

Logging:
- [ ] Creates structured JSON logs
- [ ] Supports all log levels (trace, debug, info, warn, error)
- [ ] Respects configured log level
- [ ] Child logger inherits parent context
- [ ] Redacts accessToken in logs
- [ ] Redacts refreshToken in logs
- [ ] Redacts authorization headers
- [ ] Redacts nested token fields
- [ ] Custom redaction paths supported
- [ ] Log output is valid JSON

Error Handling:
- [ ] Config file not found error
- [ ] Invalid YAML syntax error
- [ ] Schema validation error with details
- [ ] Invalid env override type error

Performance:
- [ ] Config loading < 50ms
- [ ] Logger overhead < 1ms per call

---

## Testing Strategy

### Unit Tests
```typescript
// Config Schema Validation
- Valid minimal config
- Valid full config with all options
- Invalid config (missing required fields)
- Invalid types (string vs number)
- Unknown fields are ignored
- Default values applied

// Config Loading
- Load from valid YAML file
- Handle missing config file
- Handle invalid YAML syntax
- Handle file read errors

// Environment Overrides
- Override claudePath
- Override oauth.clientId
- Override oauth.tokenUrl
- Override refreshThreshold
- Override logging.level
- Multiple overrides work together
- Invalid env values rejected

// Logger
- Log at each level
- Child logger context
- Level filtering
- JSON output format
- Timestamp inclusion
- Error serialization

// Token Redaction
- Redact top-level accessToken
- Redact nested token.accessToken
- Redact refreshToken
- Redact authorization headers
- Partial redaction (keep metadata)
- Array of tokens redacted
```

### Integration Tests
```typescript
// End-to-End Config Flow
- Load config → apply env → validate → create Config instance
- Invalid config rejected before creating instance
- Logger created with config.logging settings
- Config reload capability

// Logger Integration
- Logger with config-based settings
- Context propagation through child loggers
- Redaction with real token objects
```

---

## Success Metrics

- **Test Coverage**: ≥95% for config and logging modules
- **Test Pass Rate**: 100% on all platforms
- **Performance**: Config load < 50ms, log write < 1ms
- **Security**: Zero token leaks in logs (verified by audit test)
- **Code Quality**: Zero ESLint errors, Prettier formatted

---

## Downstream Impact

**Unblocks**:
- GH-03: Token Store needs config for encryption settings
- GH-06: Profile Manager needs config for paths
- GH-05: Auth Manager needs logger for audit trail
- GH-07: Platform adapters need config for paths

**Provides**:
- `Config` instance with validated settings
- `Logger` instance with token redaction
- Environment override mechanism
- Type-safe config access

---

## Definition of Done

Development:
- [ ] All 10 commits completed following TDD
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Code reviewed and approved
- [ ] No TypeScript errors
- [ ] ESLint rules passing
- [ ] Prettier formatting applied

Documentation:
- [ ] JSDoc comments on public APIs
- [ ] README section on configuration
- [ ] Example config.yml provided
- [ ] Environment variable list documented

Testing:
- [ ] 95%+ code coverage
- [ ] All edge cases tested
- [ ] Error paths tested
- [ ] Security (redaction) verified

CI/CD:
- [ ] Tests pass on Linux
- [ ] Tests pass on Windows
- [ ] Tests pass on macOS
- [ ] No new warnings or errors

---

## Related Files

```
src/
├── config/
│   ├── Config.ts           # Config class with getters
│   ├── ConfigLoader.ts     # YAML loading + env override
│   ├── types.ts            # Zod schema + ConfigData type
│   └── envOverrides.ts     # Environment variable mapping
└── utils/
    ├── Logger.ts           # Pino wrapper with redaction
    └── redactionPaths.ts   # Default redaction paths

tests/
├── config/
│   ├── Config.test.ts      # Schema validation tests
│   └── ConfigLoader.test.ts # Loading + override tests
└── utils/
    └── Logger.test.ts      # Logging + redaction tests

fixtures/
└── config.yml              # Example valid config
```

---

## Branch Strategy

```bash
# Create feature branch from main
git checkout main
git pull origin main
git checkout -b feat/02-config-logging

# Work through 10 TDD commits
git add tests/config/Config.test.ts
git commit -m "test(config): add schema validation tests"

git add src/config/{Config,types}.ts
git commit -m "feat(config): implement Zod config schema"

# ... continue through all 10 commits ...

# Push and create PR
git push -u origin feat/02-config-logging
gh pr create --title "feat: config loader and logging" \
  --body "Implements GH-02: Config + Logging (closes #4)"
```

---

## Estimated Effort

**Time**: 6-8 hours
**Complexity**: Medium
**Risk**: Low

**Breakdown**:
- Config schema + validation: 1.5 hours
- Config loader + YAML: 1.5 hours
- Environment overrides: 1.5 hours
- Logger implementation: 2 hours
- Token redaction: 1.5 hours
- Integration tests: 1 hour

**Dependencies**: Requires GH-00 bootstrap (npm, TypeScript, Jest setup)
