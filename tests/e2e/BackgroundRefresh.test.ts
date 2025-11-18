import { IntegrationHarness } from '../integration/IntegrationHarness';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: Background Refresh', () => {
  let harness: IntegrationHarness;

  beforeEach(async () => {
    const testDir = join(tmpdir(), `bg-refresh-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  it('should refresh token when manually triggered and approaching expiry', async () => {
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

    // Manually trigger refresh (simulates what background refresh would do)
    const token = await authManager.ensureValidToken();

    // Verify token was refreshed
    expect(token.accessToken).toBe('refreshed-token');
    expect(token.refreshToken).toBe('new-refresh');
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

    // Calling ensureValidToken should return existing token without refresh
    const token = await authManager.ensureValidToken();

    // Should return the existing token
    expect(token.accessToken).toBe('valid-token');

    // No HTTP request should have been made
    expect(harness.mockHttp.history.post).toHaveLength(0);
  });
});
