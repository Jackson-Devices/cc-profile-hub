import { TokenStore } from '../../src/auth/TokenStore';
import { TokenData } from '../../src/auth/TokenData';
import { TokenError } from '../../src/errors/TokenError';
import { mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import * as atomicWriteModule from '../../src/utils/atomicWrite';

describe('TokenStore Read', () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(() => {
    tempDir = join(tmpdir(), `token-store-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    store = new TokenStore(tempDir);
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
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
      deviceFingerprint: 'device-123',
    };

    // Pre-populate token file
    writeFileSync(join(tempDir, `${profileId}.token.json`), JSON.stringify(tokenData));

    const result = await store.read(profileId);

    expect(result).toEqual(tokenData);
  });

  it('should return null for non-existent profile', async () => {
    const result = await store.read('nonexistent');

    expect(result).toBeNull();
  });

  it('should handle corrupted token file', async () => {
    const profileId = 'corrupted';
    writeFileSync(join(tempDir, `${profileId}.token.json`), 'invalid json {');

    const result = await store.read(profileId);

    expect(result).toBeNull();
  });
});

describe('TokenStore Write', () => {
  let tempDir: string;
  let store: TokenStore;

  beforeEach(() => {
    tempDir = join(tmpdir(), `token-store-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    store = new TokenStore(tempDir);
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should write token data to file', async () => {
    const profileId = 'write-test';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    await store.write(profileId, tokenData);

    const result = await store.read(profileId);
    expect(result).toEqual(tokenData);
  });

  it('should overwrite existing token', async () => {
    const profileId = 'overwrite-test';
    const tokenData1: TokenData = {
      accessToken: 'old-token',
      refreshToken: 'old-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };
    const tokenData2: TokenData = {
      accessToken: 'new-token',
      refreshToken: 'new-refresh',
      expiresAt: Date.now() + 7200000,
      grantedAt: Date.now(),
      scopes: ['user:inference', 'admin'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-456',
    };

    await store.write(profileId, tokenData1);
    await store.write(profileId, tokenData2);

    const result = await store.read(profileId);
    expect(result).toEqual(tokenData2);
  });

  it('should use atomic write with temp file', async () => {
    const profileId = 'atomic-test';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    await store.write(profileId, tokenData);

    // Verify no temp files remain
    const files = readdirSync(tempDir);
    const tempFiles = files.filter((f: string) => f.includes('.tmp'));
    expect(tempFiles).toHaveLength(0);
  });

  it('should set file permissions to 0600 (owner read/write only)', async () => {
    const profileId = 'permission-test';
    const tokenData: TokenData = {
      accessToken: 'sensitive-token',
      refreshToken: 'sensitive-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    await store.write(profileId, tokenData);

    // Check file permissions
    const filePath = join(tempDir, `${profileId}.token.json`);
    const stats = statSync(filePath);

    // Extract file mode (permissions) - mask out file type bits
    const mode = stats.mode & 0o777;

    // On Unix-like systems, expect 0600 (owner read/write only)
    // On Windows, permissions are handled differently by the OS
    if (process.platform !== 'win32') {
      expect(mode).toBe(0o600);
    } else {
      // On Windows, just verify the file exists and is readable
      expect(stats.isFile()).toBe(true);
    }
  });

  it('should throw TokenError when permission verification fails', async () => {
    const profileId = 'permission-error-test';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    // Mock atomicWrite to throw permission verification error
    jest.spyOn(atomicWriteModule, 'atomicWrite').mockRejectedValue(
      new Error('File permissions verification failed: expected 0600, got 0644')
    );

    try {
      await store.write(profileId, tokenData);
      fail('Should have thrown a TokenError');
    } catch (error) {
      expect(error).toBeInstanceOf(TokenError);
      expect((error as Error).message).toContain('permissions verification failed');
    }

    // Restore original
    jest.restoreAllMocks();
  });

  it('should rethrow non-permission errors', async () => {
    const profileId = 'generic-error-test';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    // Mock atomicWrite to throw a generic error
    jest.spyOn(atomicWriteModule, 'atomicWrite').mockRejectedValue(
      new Error('Disk full')
    );

    try {
      await store.write(profileId, tokenData);
      fail('Should have thrown an error');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toBeInstanceOf(TokenError);
      expect((error as Error).message).toBe('Disk full');
    }

    jest.restoreAllMocks();
  });
});
