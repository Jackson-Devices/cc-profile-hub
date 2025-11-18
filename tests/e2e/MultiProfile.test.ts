import { IntegrationHarness } from '../integration/IntegrationHarness';
import { FixtureBinary } from './FixtureBinary';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: Multi-Profile Workflow', () => {
  let harness: IntegrationHarness;
  let fixture: FixtureBinary;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `e2e-${Date.now()}`);
    harness = new IntegrationHarness(testDir);
    fixture = new FixtureBinary();

    await harness.setup();
  });

  afterEach(async () => {
    await harness.cleanup();
    await fixture.cleanup();
  });

  it('should execute command with profile 1 token', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Profile1',
      email: 'p1@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'profile1-token',
      expiresAt: Date.now() + 3600000
    });

    await harness.stateManager.switchTo(profile1.id);

    const authManager = harness.createAuthManager(profile1.id);
    const token = await authManager.ensureValidToken();

    expect(token.accessToken).toBe('profile1-token');
  });

  it('should switch between profiles', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Work',
      email: 'work@example.com'
    });

    const profile2 = await harness.createTestProfile({
      nickname: 'Personal',
      email: 'personal@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'work-token',
      expiresAt: Date.now() + 3600000
    });

    await harness.injectToken(profile2.id, {
      accessToken: 'personal-token',
      expiresAt: Date.now() + 3600000
    });

    // Activate profile 1
    await harness.stateManager.switchTo(profile1.id);
    let active = await harness.getActiveProfile();
    expect(active?.id).toBe('work');

    // Switch to profile 2
    await harness.stateManager.switchTo(profile2.id);
    active = await harness.getActiveProfile();
    expect(active?.id).toBe('personal');

    // Verify correct token
    const authManager = harness.createAuthManager(profile2.id);
    const token = await authManager.ensureValidToken();
    expect(token.accessToken).toBe('personal-token');
  });

  it('should isolate tokens between profiles', async () => {
    const profile1 = await harness.createTestProfile({
      nickname: 'Profile1',
      email: 'p1@example.com'
    });

    const profile2 = await harness.createTestProfile({
      nickname: 'Profile2',
      email: 'p2@example.com'
    });

    await harness.injectToken(profile1.id, {
      accessToken: 'token1',
      expiresAt: Date.now() + 3600000
    });

    await harness.injectToken(profile2.id, {
      accessToken: 'token2',
      expiresAt: Date.now() + 3600000
    });

    const token1 = await harness.tokenStore.read(profile1.id);
    const token2 = await harness.tokenStore.read(profile2.id);

    expect(token1?.accessToken).toBe('token1');
    expect(token2?.accessToken).toBe('token2');
  });
});
