import { EncryptedTokenStore } from '../../src/auth/EncryptedTokenStore';
import { TokenData } from '../../src/auth/TokenData';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('EncryptedTokenStore', () => {
  let tempDir: string;
  let store: EncryptedTokenStore;
  const passphrase = 'test-passphrase-123';

  beforeEach(() => {
    tempDir = join(tmpdir(), `encrypted-store-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    store = new EncryptedTokenStore(tempDir, passphrase);
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should write and read encrypted token', async () => {
    const profileId = 'encrypted-test';
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

  it('should store token as encrypted on disk', async () => {
    const profileId = 'verify-encrypted';
    const tokenData: TokenData = {
      accessToken: 'secret-token',
      refreshToken: 'secret-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    await store.write(profileId, tokenData);

    // Read raw file content
    const filePath = join(tempDir, `${profileId}.token.json`);
    const rawContent = readFileSync(filePath, 'utf-8');

    // Should not contain plaintext tokens
    expect(rawContent).not.toContain('secret-token');
    expect(rawContent).not.toContain('secret-refresh');
  });

  it('should return null with wrong passphrase', async () => {
    const profileId = 'wrong-pass-test';
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

    // Try to read with wrong passphrase
    const wrongStore = new EncryptedTokenStore(tempDir, 'wrong-passphrase');
    const result = await wrongStore.read(profileId);

    expect(result).toBeNull();
  });

  it('should handle non-existent profile', async () => {
    const result = await store.read('nonexistent');
    expect(result).toBeNull();
  });

  it('should support unencrypted mode when no passphrase', async () => {
    const unencryptedStore = new EncryptedTokenStore(tempDir);
    const profileId = 'unencrypted-test';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    await unencryptedStore.write(profileId, tokenData);
    const result = await unencryptedStore.read(profileId);

    expect(result).toEqual(tokenData);
  });
});

describe('EncryptedTokenStore Corruption Recovery', () => {
  let tempDir: string;
  let store: EncryptedTokenStore;
  const passphrase = 'test-passphrase-123';

  beforeEach(() => {
    tempDir = join(tmpdir(), `corruption-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
    store = new EncryptedTokenStore(tempDir, passphrase);
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should handle corrupted encrypted file gracefully', async () => {
    const profileId = 'corrupted-encrypted';
    const filePath = join(tempDir, `${profileId}.token.json`);

    // Write corrupted encrypted data
    const corruptedData = JSON.stringify({ encrypted: 'invalid-base64-data!!!' });
    writeFileSync(filePath, corruptedData);

    const result = await store.read(profileId);
    expect(result).toBeNull();
  });

  it('should handle malformed JSON gracefully', async () => {
    const profileId = 'malformed-json';
    const filePath = join(tempDir, `${profileId}.token.json`);

    // Write malformed JSON
    writeFileSync(filePath, '{ invalid json content }');

    const result = await store.read(profileId);
    expect(result).toBeNull();
  });

  it('should handle truncated encrypted file', async () => {
    const profileId = 'truncated';
    const tokenData: TokenData = {
      accessToken: 'test-access',
      refreshToken: 'test-refresh',
      expiresAt: Date.now() + 3600000,
      grantedAt: Date.now(),
      scopes: ['user:inference'],
      tokenType: 'Bearer',
      deviceFingerprint: 'device-123',
    };

    // Write valid token first
    await store.write(profileId, tokenData);

    // Corrupt the file by truncating it
    const corruptedFilePath = join(tempDir, `${profileId}.token.json`);
    const content = readFileSync(corruptedFilePath, 'utf-8');
    const truncated = content.slice(0, content.length / 2);
    writeFileSync(corruptedFilePath, truncated);

    const result = await store.read(profileId);
    expect(result).toBeNull();
  });

  it('should recover from leftover temp files on next write', async () => {
    const profileId = 'temp-recovery';
    const tempPath = join(tempDir, `${profileId}.token.json.tmp`);

    // Simulate leftover temp file from crashed write
    const tempData = JSON.stringify({ encrypted: 'old-temp-data' });
    writeFileSync(tempPath, tempData);

    // Write new data - should succeed and overwrite temp file
    const tokenData: TokenData = {
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
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
});
