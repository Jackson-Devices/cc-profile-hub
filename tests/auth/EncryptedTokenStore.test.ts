import { EncryptedTokenStore } from '../../src/auth/EncryptedTokenStore';
import { TokenData } from '../../src/auth/TokenData';
import { mkdirSync, rmSync, readFileSync } from 'fs';
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
