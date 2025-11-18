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
    expect(harness.tokenRefresher).toBeDefined();
    expect(harness.stateManager).toBeDefined();
    expect(harness.mockHttp).toBeDefined();
  });

  it('should create test profile', async () => {
    await harness.setup();

    const profile = await harness.createTestProfile({
      nickname: 'Test',
      email: 'test@example.com'
    });

    expect(profile.id).toBeTruthy();
    expect(profile.id).toBe('test');
    expect(profile.tokenUrl).toBeTruthy();
    expect(profile.clientId).toBeTruthy();
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
