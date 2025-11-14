import { TokenStore } from '../../src/auth/TokenStore';
import { TokenData } from '../../src/auth/TokenData';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
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
