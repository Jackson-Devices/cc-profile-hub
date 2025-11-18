import { IntegrationHarness } from '../integration/IntegrationHarness';
import { join } from 'path';
import { tmpdir } from 'os';
import { writeFile } from 'fs/promises';

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
    const tokenPath = join(harness['testDir'], 'tokens', `${profile.id}.token.json`);
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
