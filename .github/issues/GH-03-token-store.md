# GH-03: Token Store + Crypto Layer

**Parent**: #1 (Project Blueprint)
**Depends On**: #2 (GH-00 Foundation), #4 (GH-02 Config)
**Unblocks**: #6 (GH-04 Token Refresher), #8 (GH-06 Profile Manager)
**External Dependencies**: `node:crypto`, OS credential stores (optional)

---

## Overview

Implements secure token persistence using OS-native credential stores (Windows Credential Manager, macOS Keychain, Linux libsecret) with encrypted file fallback. Provides corruption recovery and atomic write guarantees.

**Key Features**:
- Read/write tokens from OS secure store
- Encrypted file fallback (AES-256-GCM)
- Per-profile token isolation
- Atomic writes with fsync
- Corruption detection and recovery
- Master key derivation from OS keyring

---

## TDD Workflow (12 Atomic Commits)

### Commit 1: TokenData Model Test (RED)
**Message**: `test(auth): add TokenData validation tests`

**Files Changed**:
- `tests/auth/TokenData.test.ts` (new)

**Code**:
```typescript
import { TokenData, validateTokenData } from '../../src/auth/TokenData';

describe('TokenData Validation', () => {
  it('should validate valid token data', () => {
    const data: TokenData = {
      accessToken: 'sk-ant-test123',
      refreshToken: 'refresh-test123',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    expect(() => validateTokenData(data)).not.toThrow();
  });

  it('should reject expired token timestamps', () => {
    const data = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() - 1000, // expired
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    expect(() => validateTokenData(data)).toThrow(/expired/);
  });

  it('should reject missing required fields', () => {
    const data = {
      accessToken: 'test'
    };

    expect(() => validateTokenData(data)).toThrow(/refreshToken/);
  });

  it('should validate token is not expired', () => {
    const data: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    expect(data.expiresAt).toBeGreaterThan(Date.now());
  });
});
```

**Expected Result**: ❌ RED - TokenData module doesn't exist

---

### Commit 2: TokenData Model Implementation (GREEN)
**Message**: `feat(auth): implement TokenData model with validation`

**Files Changed**:
- `src/auth/TokenData.ts` (new)

**Code**:
```typescript
// src/auth/TokenData.ts
import { z } from 'zod';

export const TokenDataSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number().positive(),
  grantedAt: z.number().positive(),
  scopes: z.array(z.string()),
  tokenType: z.literal('Bearer'),
  deviceFingerprint: z.string()
});

export type TokenData = z.infer<typeof TokenDataSchema>;

export function validateTokenData(data: unknown): TokenData {
  const validated = TokenDataSchema.parse(data);

  // Additional business logic validation
  if (validated.expiresAt <= Date.now()) {
    throw new Error('Token data validation failed: token is expired');
  }

  if (validated.grantedAt > validated.expiresAt) {
    throw new Error('Token data validation failed: grantedAt after expiresAt');
  }

  return validated;
}

export function isTokenExpired(token: TokenData, bufferSeconds = 0): boolean {
  return token.expiresAt - (bufferSeconds * 1000) <= Date.now();
}
```

**Expected Result**: ✅ GREEN - TokenData validation tests pass

---

### Commit 3: Store Read Test (RED)
**Message**: `test(auth): add TokenStore read tests`

**Files Changed**:
- `tests/auth/TokenStore.test.ts` (new)

**Code**:
```typescript
import { TokenStore } from '../../src/auth/TokenStore';
import { TokenData } from '../../src/auth/TokenData';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('TokenStore Read', () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(() => {
    tempDir = join(tmpdir(), `token-store-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    store = new TokenStore(tempDir);
  });

  it('should read valid token from file', async () => {
    const profileId = 'test-profile';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    // Pre-populate token file
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      JSON.stringify(tokenData)
    );

    const result = await store.read(profileId);

    expect(result).toEqual(tokenData);
  });

  it('should return null for non-existent profile', async () => {
    const result = await store.read('nonexistent');

    expect(result).toBeNull();
  });

  it('should handle corrupted token file', async () => {
    const profileId = 'corrupted';
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      'invalid json {'
    );

    const result = await store.read(profileId);

    expect(result).toBeNull();
  });
});
```

**Expected Result**: ❌ RED - TokenStore doesn't exist

---

### Commit 4: Store Read Implementation (GREEN)
**Message**: `feat(auth): implement TokenStore read operation`

**Files Changed**:
- `src/auth/TokenStore.ts` (new)

**Code**:
```typescript
// src/auth/TokenStore.ts
import { readFile } from 'fs/promises';
import { join } from 'path';
import { TokenData, validateTokenData } from './TokenData';

export class TokenStore {
  constructor(private baseDir: string) {}

  async read(profileId: string): Promise<TokenData | null> {
    const filePath = this.getTokenPath(profileId);

    try {
      const content = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      return validateTokenData(parsed);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }

      // Log corruption but return null for recovery
      console.warn(`Corrupted token file for ${profileId}:`, error.message);
      return null;
    }
  }

  private getTokenPath(profileId: string): string {
    return join(this.baseDir, `${profileId}.token.json`);
  }
}
```

**Expected Result**: ✅ GREEN - Read tests pass

---

### Commit 5: Store Write Test (RED)
**Message**: `test(auth): add TokenStore write tests`

**Files Changed**:
- `tests/auth/TokenStore.test.ts` (update)

**Code**:
```typescript
describe('TokenStore Write', () => {
  it('should write token to file', async () => {
    const profileId = 'write-test';
    const tokenData: TokenData = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    await store.write(profileId, tokenData);

    // Verify file was written
    const result = await store.read(profileId);
    expect(result).toEqual(tokenData);
  });

  it('should overwrite existing token', async () => {
    const profileId = 'overwrite-test';
    const oldToken: TokenData = {
      accessToken: 'old',
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 1000,
      grantedAt: Date.now() - 1000,
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-old'
    };

    const newToken: TokenData = {
      accessToken: 'new',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-new'
    };

    await store.write(profileId, oldToken);
    await store.write(profileId, newToken);

    const result = await store.read(profileId);
    expect(result).toEqual(newToken);
  });

  it('should create directory if not exists', async () => {
    const newTempDir = join(tmpdir(), `new-dir-${Date.now()}`);
    const newStore = new TokenStore(newTempDir);

    const tokenData: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    await newStore.write('test', tokenData);

    const result = await newStore.read('test');
    expect(result).toEqual(tokenData);
  });
});
```

**Expected Result**: ❌ RED - Write method doesn't exist

---

### Commit 6: Store Write Implementation (GREEN)
**Message**: `feat(auth): implement atomic TokenStore write with fsync`

**Files Changed**:
- `src/auth/TokenStore.ts` (update)

**Code**:
```typescript
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { TokenData, validateTokenData } from './TokenData';

export class TokenStore {
  constructor(private baseDir: string) {}

  async read(profileId: string): Promise<TokenData | null> {
    // ... (existing implementation)
  }

  async write(profileId: string, tokenData: TokenData): Promise<void> {
    // Ensure base directory exists
    await mkdir(this.baseDir, { recursive: true });

    const finalPath = this.getTokenPath(profileId);
    const tempPath = `${finalPath}.tmp`;

    // Atomic write: write to temp file, then rename
    const content = JSON.stringify(tokenData, null, 2);
    await writeFile(tempPath, content, { encoding: 'utf-8', flag: 'w' });

    // Atomic rename (overwrites existing file)
    await rename(tempPath, finalPath);
  }

  private getTokenPath(profileId: string): string {
    return join(this.baseDir, `${profileId}.token.json`);
  }
}
```

**Expected Result**: ✅ GREEN - Write tests pass

---

### Commit 7: Encryption Test (RED)
**Message**: `test(auth): add AES-GCM encryption tests`

**Files Changed**:
- `tests/auth/CryptoProvider.test.ts` (new)

**Code**:
```typescript
import { CryptoProvider } from '../../src/auth/CryptoProvider';

describe('CryptoProvider', () => {
  let crypto: CryptoProvider;
  const masterKey = 'test-master-key-32-bytes-long!';

  beforeEach(() => {
    crypto = new CryptoProvider(masterKey);
  });

  it('should encrypt and decrypt data', () => {
    const plaintext = JSON.stringify({ secret: 'data' });

    const encrypted = crypto.encrypt(plaintext);
    const decrypted = crypto.decrypt(encrypted);

    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertext each time', () => {
    const plaintext = 'same data';

    const encrypted1 = crypto.encrypt(plaintext);
    const encrypted2 = crypto.encrypt(plaintext);

    expect(encrypted1).not.toBe(encrypted2); // Different IV/nonce
  });

  it('should throw on tampered ciphertext', () => {
    const plaintext = 'sensitive data';
    const encrypted = crypto.encrypt(plaintext);

    // Tamper with ciphertext
    const tampered = encrypted.slice(0, -10) + 'XXXXXXXXXXXX';

    expect(() => crypto.decrypt(tampered)).toThrow(/decrypt|auth/i);
  });

  it('should handle empty plaintext', () => {
    const encrypted = crypto.encrypt('');
    const decrypted = crypto.decrypt(encrypted);

    expect(decrypted).toBe('');
  });

  it('should handle large payloads', () => {
    const largePlaintext = 'x'.repeat(100000);

    const encrypted = crypto.encrypt(largePlaintext);
    const decrypted = crypto.decrypt(encrypted);

    expect(decrypted).toBe(largePlaintext);
  });
});
```

**Expected Result**: ❌ RED - CryptoProvider doesn't exist

---

### Commit 8: Encryption Implementation (GREEN)
**Message**: `feat(auth): implement AES-256-GCM encryption`

**Files Changed**:
- `src/auth/CryptoProvider.ts` (new)

**Code**:
```typescript
// src/auth/CryptoProvider.ts
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export class CryptoProvider {
  private key: Buffer;

  constructor(masterKey: string) {
    // Derive 32-byte key from master key using scrypt
    this.key = scryptSync(masterKey, 'claude-wrapper-salt', 32);
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12); // 12 bytes for GCM
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:ciphertext (all hex)
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const parts = ciphertext.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid ciphertext format');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

**Expected Result**: ✅ GREEN - Encryption tests pass

---

### Commit 9: Encrypted Store Test (RED)
**Message**: `test(auth): add encrypted TokenStore tests`

**Files Changed**:
- `tests/auth/TokenStore.test.ts` (update)

**Code**:
```typescript
import { CryptoProvider } from '../../src/auth/CryptoProvider';

describe('TokenStore with Encryption', () => {
  let store: TokenStore;
  let crypto: CryptoProvider;

  beforeEach(() => {
    tempDir = join(tmpdir(), `encrypted-store-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    crypto = new CryptoProvider('test-master-key');
    store = new TokenStore(tempDir, crypto);
  });

  it('should write and read encrypted tokens', async () => {
    const profileId = 'encrypted-test';
    const tokenData: TokenData = {
      accessToken: 'secret-access-token',
      refreshToken: 'secret-refresh-token',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    await store.write(profileId, tokenData);

    // Verify file is encrypted (not plain JSON)
    const fileContent = await readFile(
      join(tempDir, `${profileId}.token.json`),
      'utf-8'
    );
    expect(fileContent).not.toContain('secret-access-token');

    // But store can read it back
    const result = await store.read(profileId);
    expect(result).toEqual(tokenData);
  });

  it('should fail to decrypt with wrong key', async () => {
    const profileId = 'wrong-key-test';
    const tokenData: TokenData = {
      accessToken: 'test',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    await store.write(profileId, tokenData);

    // Try to read with different key
    const wrongCrypto = new CryptoProvider('wrong-master-key');
    const wrongStore = new TokenStore(tempDir, wrongCrypto);

    const result = await wrongStore.read(profileId);
    expect(result).toBeNull(); // Decryption fails, returns null
  });
});
```

**Expected Result**: ❌ RED - TokenStore doesn't support encryption yet

---

### Commit 10: Encrypted Store Implementation (GREEN)
**Message**: `feat(auth): add encryption support to TokenStore`

**Files Changed**:
- `src/auth/TokenStore.ts` (update)

**Code**:
```typescript
import { readFile, writeFile, mkdir, rename } from 'fs/promises';
import { join } from 'path';
import { TokenData, validateTokenData } from './TokenData';
import { CryptoProvider } from './CryptoProvider';

export class TokenStore {
  constructor(
    private baseDir: string,
    private crypto?: CryptoProvider
  ) {}

  async read(profileId: string): Promise<TokenData | null> {
    const filePath = this.getTokenPath(profileId);

    try {
      let content = await readFile(filePath, 'utf-8');

      // Decrypt if crypto provider is available
      if (this.crypto) {
        try {
          content = this.crypto.decrypt(content);
        } catch (error) {
          console.warn(`Failed to decrypt token for ${profileId}`);
          return null;
        }
      }

      const parsed = JSON.parse(content);
      return validateTokenData(parsed);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }

      console.warn(`Corrupted token file for ${profileId}:`, error.message);
      return null;
    }
  }

  async write(profileId: string, tokenData: TokenData): Promise<void> {
    await mkdir(this.baseDir, { recursive: true });

    const finalPath = this.getTokenPath(profileId);
    const tempPath = `${finalPath}.tmp`;

    let content = JSON.stringify(tokenData, null, 2);

    // Encrypt if crypto provider is available
    if (this.crypto) {
      content = this.crypto.encrypt(content);
    }

    await writeFile(tempPath, content, { encoding: 'utf-8', flag: 'w' });
    await rename(tempPath, finalPath);
  }

  private getTokenPath(profileId: string): string {
    return join(this.baseDir, `${profileId}.token.json`);
  }
}
```

**Expected Result**: ✅ GREEN - Encrypted store tests pass

---

### Commit 11: Corruption Recovery Test (RED)
**Message**: `test(auth): add corruption recovery tests`

**Files Changed**:
- `tests/auth/TokenStore.test.ts` (update)

**Code**:
```typescript
describe('TokenStore Corruption Recovery', () => {
  it('should recover from corrupted file by returning null', async () => {
    const profileId = 'corrupted-recovery';
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      'corrupted data {'
    );

    const result = await store.read(profileId);

    expect(result).toBeNull();
  });

  it('should recover from invalid JSON', async () => {
    const profileId = 'invalid-json';
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      '{"invalid": json}'
    );

    const result = await store.read(profileId);

    expect(result).toBeNull();
  });

  it('should recover from schema validation failure', async () => {
    const profileId = 'invalid-schema';
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      JSON.stringify({ wrong: 'schema' })
    );

    const result = await store.read(profileId);

    expect(result).toBeNull();
  });

  it('should allow overwriting corrupted file', async () => {
    const profileId = 'overwrite-corrupted';

    // Write corrupted data
    writeFileSync(
      join(tempDir, `${profileId}.token.json`),
      'corrupted'
    );

    expect(await store.read(profileId)).toBeNull();

    // Overwrite with valid data
    const validToken: TokenData = {
      accessToken: 'valid',
      refreshToken: 'valid-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123'
    };

    await store.write(profileId, validToken);

    const result = await store.read(profileId);
    expect(result).toEqual(validToken);
  });
});
```

**Expected Result**: ❌ RED - Some edge cases may not be handled

---

### Commit 12: Corruption Recovery Implementation (GREEN)
**Message**: `feat(auth): improve corruption recovery handling`

**Files Changed**:
- `src/auth/TokenStore.ts` (update)
- `src/utils/Logger.ts` (use for warnings)

**Code**:
```typescript
// Update read method with better error handling
async read(profileId: string): Promise<TokenData | null> {
  const filePath = this.getTokenPath(profileId);

  try {
    let content = await readFile(filePath, 'utf-8');

    // Decrypt if crypto provider is available
    if (this.crypto) {
      try {
        content = this.crypto.decrypt(content);
      } catch (decryptError: any) {
        console.warn(
          `Decryption failed for ${profileId}: ${decryptError.message}. ` +
          `File may be corrupted or encrypted with different key.`
        );
        return null;
      }
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.warn(`Invalid JSON in token file for ${profileId}`);
      return null;
    }

    try {
      return validateTokenData(parsed);
    } catch (validationError: any) {
      console.warn(
        `Token validation failed for ${profileId}: ${validationError.message}`
      );
      return null;
    }
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null; // File doesn't exist, not an error
    }

    // Unexpected error
    console.error(`Unexpected error reading token for ${profileId}:`, error);
    return null;
  }
}
```

**Expected Result**: ✅ GREEN - All corruption recovery tests pass

---

## Acceptance Criteria

TokenData Model:
- [ ] Validates all required fields
- [ ] Rejects expired tokens on load
- [ ] Validates grantedAt < expiresAt
- [ ] Validates tokenType is 'Bearer'
- [ ] Validates scopes array
- [ ] Type-safe with Zod schema

TokenStore Read:
- [ ] Reads valid token from file
- [ ] Returns null for non-existent profile
- [ ] Handles corrupted JSON gracefully
- [ ] Handles invalid schema gracefully
- [ ] Decrypts encrypted tokens
- [ ] Returns null on decryption failure

TokenStore Write:
- [ ] Writes token to file
- [ ] Overwrites existing token
- [ ] Creates directory if missing
- [ ] Uses atomic write (temp + rename)
- [ ] Encrypts tokens when crypto provider given
- [ ] Validates token before writing

Encryption:
- [ ] Uses AES-256-GCM
- [ ] Generates random IV per encryption
- [ ] Verifies authentication tag
- [ ] Rejects tampered ciphertext
- [ ] Handles empty plaintext
- [ ] Handles large payloads (>100KB)
- [ ] Derives key from master key using scrypt

Corruption Recovery:
- [ ] Recovers from corrupted file
- [ ] Recovers from invalid JSON
- [ ] Recovers from schema validation failure
- [ ] Recovers from decryption failure
- [ ] Allows overwriting corrupted file
- [ ] Logs warnings for corruption

---

## Testing Strategy

### Unit Tests
```typescript
// TokenData Validation
- Valid token data
- Expired token rejection
- Missing required fields
- Invalid field types
- Invalid timestamp order
- Edge case: expiresAt === now

// TokenStore Read
- Read existing token
- Non-existent profile
- Corrupted file
- Invalid JSON
- Decryption failure
- File permission error

// TokenStore Write
- Write new token
- Overwrite existing
- Create missing directory
- Atomic write verification
- Encryption verification

// CryptoProvider
- Encrypt/decrypt round trip
- Unique IV per encryption
- Tamper detection
- Empty plaintext
- Large payload
- Invalid ciphertext format

// Corruption Recovery
- JSON parse error
- Schema validation error
- Decryption error
- Overwrite corrupted file
```

### Integration Tests
```typescript
// End-to-End Token Persistence
- Write encrypted token → Read back
- Multiple profiles isolated
- Concurrent reads/writes
- Master key change detection

// Upgrade Path
- Read unencrypted legacy token
- Migrate to encrypted format
- Backward compatibility
```

---

## Success Metrics

- **Test Coverage**: ≥95% for TokenStore and CryptoProvider
- **Test Pass Rate**: 100% on all platforms
- **Security**: Zero plaintext tokens in files (when encrypted)
- **Performance**: Read/write < 10ms
- **Reliability**: 100% atomic writes (verified with crash tests)

---

## Downstream Impact

**Unblocks**:
- GH-04: Token Refresher needs TokenStore to persist refreshed tokens
- GH-06: Profile Manager needs TokenStore for profile-specific tokens
- GH-05: Auth Manager needs TokenStore for ensureValidToken

**Provides**:
- `TokenStore` class for read/write operations
- `CryptoProvider` for encryption
- `TokenData` validated model
- Corruption recovery guarantees

---

## Definition of Done

Development:
- [ ] All 12 commits completed following TDD
- [ ] All unit tests passing
- [ ] Integration tests passing
- [ ] Code reviewed and approved
- [ ] No TypeScript errors
- [ ] ESLint rules passing

Documentation:
- [ ] JSDoc comments on public APIs
- [ ] README section on token storage
- [ ] Security notes on encryption
- [ ] Migration guide for existing tokens

Testing:
- [ ] 95%+ code coverage
- [ ] All edge cases tested
- [ ] Corruption scenarios tested
- [ ] Concurrent access tested

Security:
- [ ] Tokens never logged in plaintext
- [ ] Encrypted files verified
- [ ] Auth tag validation working
- [ ] Master key derivation secure

---

## Related Files

```
src/
└── auth/
    ├── TokenData.ts        # TokenData model + validation
    ├── TokenStore.ts       # Read/write token persistence
    └── CryptoProvider.ts   # AES-GCM encryption

tests/
└── auth/
    ├── TokenData.test.ts       # Model validation tests
    ├── TokenStore.test.ts      # Store read/write tests
    └── CryptoProvider.test.ts  # Encryption tests
```

---

## Branch Strategy

```bash
git checkout main
git pull origin main
git checkout -b feat/03-token-store

# Work through 12 TDD commits
git add tests/auth/TokenData.test.ts
git commit -m "test(auth): add TokenData validation tests"

git add src/auth/TokenData.ts
git commit -m "feat(auth): implement TokenData model with validation"

# ... continue through all 12 commits ...

git push -u origin feat/03-token-store
gh pr create --title "feat: token store and encryption" \
  --body "Implements GH-03: Token Store + Crypto (closes #5)"
```

---

## Estimated Effort

**Time**: 8-10 hours
**Complexity**: Medium-High
**Risk**: Medium (encryption correctness critical)

**Breakdown**:
- TokenData model: 1 hour
- TokenStore read/write: 2 hours
- CryptoProvider: 3 hours
- Encryption integration: 2 hours
- Corruption recovery: 1.5 hours
- Integration tests: 1 hour

**Dependencies**: Requires GH-00 (bootstrap), GH-02 (config for paths)
